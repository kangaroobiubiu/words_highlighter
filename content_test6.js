// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;","'":"&#39;"}[c]));
}

// 转义正则特殊字符
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 清除旧高亮
function clearHighlights() {
    document.querySelectorAll('[class^="multi-highlighted-"]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        }
    });
}

// 注入样式
function injectStyles(lists) {
    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const styleId = `style-multi-highlighted-${listIndex}`;
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                .multi-highlighted-${listIndex} {
                    color: ${list.textColor} !important;
                    background-color: ${list.bgColor} !important;
                    font-weight: bold;
                    padding: 0 2px;
                    border-radius: 2px;
                }
            `;
            document.head.appendChild(style);
        }
    });
}

// 构建 wordMap 和 regex
function buildWordMapAndRegex(lists) {
    const allWords = [];
    const wordMap = {};
    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const arr = list.words.split("\n").map(w => w.trim()).filter(Boolean);
        arr.forEach(word => {
            allWords.push({ word, listIndex, textColor: list.textColor, bgColor: list.bgColor });
            wordMap[word.toLowerCase()] = { word, listIndex, textColor: list.textColor, bgColor: list.bgColor };
        });
    });

    allWords.sort((a, b) => b.word.length - a.word.length);
    if (!allWords.length) return { regex: null, wordMap };

    const regex = new RegExp(`\\b(${allWords.map(w => escapeRegex(w.word)).join("|")})\\b`, "gi");
    return { regex, wordMap };
}

// 判断节点是否可高亮
function shouldSkipNode(node) {
    const parent = node.parentNode;
    if (!parent || /(script|style|textarea|input)/i.test(parent.tagName)) return true;
    if (parent.classList && Array.from(parent.classList).some(c => c.startsWith("multi-highlighted-"))) return true;
    return false;
}

// 创建高亮 fragment
function createHighlightedFragment(text, regex, wordMap) {
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    text.replace(regex, (match, _, offset) => {
        if (offset > lastIndex) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
        }
        const info = wordMap[match.toLowerCase()];
        const span = document.createElement("span");
        span.className = `multi-highlighted-${info.listIndex}`;
        span.textContent = match;
        frag.appendChild(span);
        lastIndex = offset + match.length;
    });
    if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    return frag;
}

// 高亮文本节点
function highlightTextInNode(node, regex, wordMap) {
    if (node.nodeType !== 3 || shouldSkipNode(node)) return;
    const text = node.nodeValue;
    if (!regex || !regex.test(text)) return;
    const frag = createHighlightedFragment(text, regex, wordMap);
    node.parentNode.replaceChild(frag, node);
}

// 判断节点是否可见
function isVisible(node) {
    if (!node.getBoundingClientRect) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

// 高亮函数（先高亮可见区域，再异步处理剩余）
function highlightAllListsFast(lists) {
    clearHighlights();
    injectStyles(lists);

    const { regex, wordMap } = buildWordMapAndRegex(lists);
    if (!regex) return;
    cachedRegex = regex;
    cachedWordMap = wordMap;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });

    const visibleNodes = [];
    const remainingNodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (isVisible(node.parentNode)) visibleNodes.push(node);
        else remainingNodes.push(node);
    }

    // 先高亮可见区域
    visibleNodes.forEach(n => highlightTextInNode(n, regex, wordMap));

    // 异步分批处理剩余节点
    function processBatch(nodes, batchSize = 200) {
        let count = 0;
        function next() {
            if (!nodes.length) return;
            while (count < batchSize && nodes.length > 0) {
                const n = nodes.shift();
                highlightTextInNode(n, regex, wordMap);
                count++;
            }
            count = 0;
            if (nodes.length > 0) requestIdleCallback(next);
        }
        requestIdleCallback(next);
    }
    processBatch(remainingNodes);
}

// 缓存
let cachedRegex = null;
let cachedWordMap = null;

// observer 仅监听新增节点
const observer = new MutationObserver(mutations => {
    if (!cachedRegex || !cachedWordMap) return;
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => highlightTextInNode(node, cachedRegex, cachedWordMap));
    });
});

// 初次加载
chrome.storage.local.get("lists", data => {
    const lists = data.lists || [];
    if (!lists.length) return;
    highlightAllListsFast(lists);
    observer.observe(document.body, { childList: true, subtree: true });
});

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") {
        chrome.storage.local.get("lists", data => {
            const lists = data.lists || [];
            if (!lists.length) return;
            highlightAllListsFast(lists);
        });
    }
});
// 可正常运行 速度有提升，可是部分长网页，后半部分没有高亮效果