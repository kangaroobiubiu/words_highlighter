// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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

// 构建 Map 和正则
function buildWordMapAndRegex(lists) {
    const allWords = [];
    const wordMap = new Map();

    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const arr = list.words.split("\n").map(w => w.trim()).filter(Boolean);
        arr.forEach(word => {
            allWords.push({ word, listIndex, textColor: list.textColor, bgColor: list.bgColor });
            wordMap.set(word.toLowerCase(), { word, listIndex, textColor: list.textColor, bgColor: list.bgColor });
        });
    });

    // 长词优先
    allWords.sort((a, b) => b.word.length - a.word.length);

    const regex = new RegExp(`\\b(${allWords.map(w => escapeRegex(w.word)).join("|")})\\b`, "gi");

    return { regex, wordMap };
}

// 分块遍历 DOM，高亮文本
function highlightTextInNode(node, regex, wordMap) {
    if (node.nodeType === 3) {
        const parent = node.parentNode;
        if (!parent || /(script|style|textarea|input)/i.test(parent.tagName)) return;

        const text = node.nodeValue;
        if (!regex.test(text)) return;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;

        text.replace(regex, (match, _, offset) => {
            if (offset > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
            }
            const info = wordMap.get(match.toLowerCase());
            const span = document.createElement("span");
            span.className = `multi-highlighted-${info.listIndex}`;
            span.textContent = match;
            frag.appendChild(span);

            lastIndex = offset + match.length;
        });

        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        parent.replaceChild(frag, node);
    } else if (node.nodeType === 1 && node.childNodes) {
        const children = Array.from(node.childNodes);
        children.forEach(child => highlightTextInNode(child, regex, wordMap));
    }
}

// 分批高亮 DOM，避免卡顿
function highlightAllListsBatched(lists) {
    clearHighlights();
    injectStyles(lists);

    const { regex, wordMap } = buildWordMapAndRegex(lists);
    if (wordMap.size === 0) return;

    const nodes = Array.from(document.body.childNodes);

    function processBatch(batchSize = 50) {
        let count = 0;

        function next() {
            if (nodes.length === 0) return;
            while (count < batchSize && nodes.length > 0) {
                const node = nodes.shift();
                highlightTextInNode(node, regex, wordMap);
                count++;
            }
            count = 0;
            if (nodes.length > 0) requestIdleCallback(next);
        }

        requestIdleCallback(next);
    }

    processBatch();
}

// 刷新高亮
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        highlightAllListsBatched(lists);
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});

// 监听新增 DOM 节点，增量高亮
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;
        const { regex, wordMap } = buildWordMapAndRegex(lists);

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => highlightTextInNode(node, regex, wordMap));
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });


// 不可使用 会不断加载
// 长词优先匹配
//
// 多列表独立样式，高亮互不覆盖
//
// 支持 10 万+ 单词列表不卡顿
//
// 分块遍历 DOM + requestIdleCallback 分批处理
//
// Map 替代 find，提高匹配速度
//
// 动态增量更新，减少重复渲染