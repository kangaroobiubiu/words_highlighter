// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
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

// 注入样式（每个列表一次）
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

// 构建 wordMap 和正则
function buildWordMapAndRegex(lists) {
    const allWords = [];
    const wordMap = {}; // 使用普通对象优化查找

    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const arr = list.words.split("\n").map(w => w.trim()).filter(Boolean);
        arr.forEach(word => {
            allWords.push({ word, listIndex, textColor: list.textColor, bgColor: list.bgColor });
            wordMap[word.toLowerCase()] = { word, listIndex, textColor: list.textColor, bgColor: list.bgColor };
        });
    });

    // 长词优先
    allWords.sort((a, b) => b.word.length - a.word.length);

    if (allWords.length === 0) return { regex: null, wordMap };

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

// 构建高亮 fragment
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
    if (node.nodeType === 3) { // 文本节点
        if (shouldSkipNode(node)) return;
        const text = node.nodeValue;
        if (!regex || !regex.test(text)) return;
        const frag = createHighlightedFragment(text, regex, wordMap);
        node.parentNode.replaceChild(frag, node);
    }
}

// 分批高亮 DOM (TreeWalker 版本)
function highlightAllListsBatched(lists) {
    clearHighlights();
    injectStyles(lists);

    const { regex, wordMap } = buildWordMapAndRegex(lists);
    if (!regex || Object.keys(wordMap).length === 0) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });

    const nodes = [];
    let node;
    while (node = walker.nextNode()) nodes.push(node);

    function processBatch(batchSize = 50) {
        let count = 0;
        function next() {
            if (nodes.length === 0) return;
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

    processBatch();
}

// 缓存 regex 和 wordMap
let cachedRegex = null;
let cachedWordMap = null;

// 定义 observer
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (!lists.length) return;

        // 只有 lists 变化才重新构建
        const { regex, wordMap } = buildWordMapAndRegex(lists);
        cachedRegex = regex;
        cachedWordMap = wordMap;

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (cachedRegex && cachedWordMap) highlightTextInNode(node, cachedRegex, cachedWordMap);
            });
        });
    });
});

// 刷新高亮
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (!lists.length) return;

        observer.disconnect();
        highlightAllListsBatched(lists);
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});

// 该代码可运行