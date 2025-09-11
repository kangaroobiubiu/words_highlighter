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
// 清除旧高亮
// ========================
function clearHighlights() {
    document.querySelectorAll('[class^="multi-highlighted-"]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
        }
    });
}

// ========================
// 注入样式
// ========================
function injectStyles(lists) {
    lists.forEach((list, idx) => {
        if (!list.enabled) return;
        const styleId = `style-multi-highlighted-${idx}`;
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                .multi-highlighted-${idx} {
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
// 构建字典 Map
// ========================
function buildWordMap(lists) {
    const wordMap = new Map();
    lists.forEach((list, idx) => {
        if (!list.enabled) return;
        list.words.split("\n").map(w => w.trim()).filter(Boolean)
            .forEach(word => {
                wordMap.set(word.toLowerCase(), {
                    word, listIndex: idx, textColor: list.textColor, bgColor: list.bgColor
                });
            });
    });
    return wordMap;
}

// ========================
// 按 token 高亮单节点
// ========================
function highlightNodeByTokens(node, wordMap) {
    if (node.nodeType !== 3) return; // 只处理文本节点
    const parent = node.parentNode;
    if (!parent) return;
    if (/(script|style|textarea|input)/i.test(parent.tagName)) return;
    if (parent.isContentEditable) return;
    if (parent.classList && [...parent.classList].some(c => c.startsWith("multi-highlighted-"))) return;

    const text = node.nodeValue;
    if (!text.trim()) return;

    // 分词，非字母数字替换为空格
    const tokens = [];
    const regexSplit = /([a-zA-Z]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = regexSplit.exec(text)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ text: text.slice(lastIndex, match.index), isWord: false });
        }
        tokens.push({ text: match[0], isWord: true });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        tokens.push({ text: text.slice(lastIndex), isWord: false });
    }

    if (!tokens.length) return;

    const frag = document.createDocumentFragment();

    tokens.forEach(tok => {
        if (!tok.isWord) {
            frag.appendChild(document.createTextNode(tok.text));
        } else {
            const key = tok.text.toLowerCase();
            if (wordMap.has(key)) {
                const info = wordMap.get(key);
                const span = document.createElement("span");
                span.className = `multi-highlighted-${info.listIndex}`;
                span.textContent = tok.text;
                frag.appendChild(span);
            } else {
                frag.appendChild(document.createTextNode(tok.text));
            }
        }
    });

    parent.replaceChild(frag, node);
}

// ========================
// 获取页面文本节点
// ========================
function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: node => {
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (/(script|style|textarea|input)/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
                if ([...parent.classList].some(c => c.startsWith("multi-highlighted-"))) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) nodes.push(node);
    return nodes;
}

// ========================
// 高亮整个页面
// ========================
function highlightPage(lists) {
    clearHighlights();
    injectStyles(lists);
    const wordMap = buildWordMap(lists);
    if (!wordMap.size) return;

    const textNodes = getTextNodes(document.body);
    const batchSize = 500;
    let index = 0;

    function processBatch() {
        const end = Math.min(index + batchSize, textNodes.length);
        for (; index < end; index++) {
            highlightNodeByTokens(textNodes[index], wordMap);
        }
        if (index < textNodes.length) {
            requestIdleCallback(processBatch);
        }
    }

    requestIdleCallback(processBatch);
}

// ========================
// 动态高亮
// ========================
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (!lists.length) return;
        const wordMap = buildWordMap(lists);
        mutations.forEach(m => m.addedNodes.forEach(node => highlightNodeByTokens(node, wordMap)));
    });
});

// ========================
// 刷新高亮
// ========================
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (!lists.length) return;
        observer.disconnect();
        highlightPage(lists);
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// ========================
// 初始化
// ========================
refreshHighlights();
chrome.runtime.onMessage.addListener(msg => { if (msg.type === "update") refreshHighlights(); });
