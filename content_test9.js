// ========================
// HTML 转义
// ========================
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

// ========================
// 正则特殊字符转义
// ========================
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ========================
// 清除旧高亮
// ========================
function clearHighlights() {
    document.querySelectorAll('[class^="multi-highlighted-"]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        }
    });
}

// ========================
// 注入样式
// ========================
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

// ========================
// 构建 Map 和正则 (内部函数)
// ========================
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

    allWords.sort((a, b) => b.word.length - a.word.length); // 长词优先

    if (allWords.length === 0) return { regex: null, wordMap };

    const regex = new RegExp(`\\b(${allWords.map(w => escapeRegex(w.word)).join("|")})\\b`, "gi");
    return { regex, wordMap };
}

// ========================
// 缓存词表和正则
// ========================
let cachedWordMap = null;
let cachedRegex = null;
let cachedListsJSON = null;

function getWordMapAndRegex(lists) {
    const listsJSON = JSON.stringify(lists);
    if (cachedListsJSON === listsJSON && cachedRegex && cachedWordMap) {
        return { regex: cachedRegex, wordMap: cachedWordMap };
    }
    const { regex, wordMap } = buildWordMapAndRegex(lists);
    cachedRegex = regex;
    cachedWordMap = wordMap;
    cachedListsJSON = listsJSON;
    return { regex, wordMap };
}

// ========================
// 高亮文本节点
// ========================
function highlightTextInNode(node, regex, wordMap) {
    if (node.nodeType !== 3) return; // 只处理文本节点
    const parent = node.parentNode;
    if (!parent) return;

    if (/(script|style|textarea|input)/i.test(parent.tagName)) return;
    if (parent.isContentEditable) return;
    if (parent.classList && Array.from(parent.classList).some(c => c.startsWith("multi-highlighted-"))) return;

    const text = node.nodeValue;
    if (!regex || !regex.test(text)) return;

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
}

// ========================
// 高亮整个页面 (TreeWalker + 分批)
// ========================
function highlightAllListsBatched(lists) {
    clearHighlights();
    injectStyles(lists);

    const { regex, wordMap } = getWordMapAndRegex(lists);
    if (!regex || wordMap.size === 0) return;

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: node => {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (/(script|style|textarea|input)/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
                if (parent.classList && Array.from(parent.classList).some(c => c.startsWith("multi-highlighted-"))) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    let node;
    while(node = walker.nextNode()) nodes.push(node);

    let index = 0;
    const batchSize = 500; // 每批节点数，可根据性能调节

    function processNextBatch(deadline) {
        const end = Math.min(index + batchSize, nodes.length);
        for (; index < end; index++) {
            highlightTextInNode(nodes[index], regex, wordMap);
        }
        if (index < nodes.length) {
            requestIdleCallback(processNextBatch);
        }
    }

    requestIdleCallback(processNextBatch);
}

// ========================
// MutationObserver 动态高亮
// ========================
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;

        const { regex, wordMap } = getWordMapAndRegex(lists);

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                highlightTextInNode(node, regex, wordMap);
            });
        });
    });
});

// ========================
// 刷新高亮
// ========================
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;

        observer.disconnect(); // 暂停监听
        highlightAllListsBatched(lists);
        observer.observe(document.body, { childList: true, subtree: true }); // 继续监听
    });
}

// ========================
// 初次加载 & 接收消息
// ========================
refreshHighlights();

chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});

// 使用了 document.createTreeWalker  不可用 会有后半部分网页无高亮