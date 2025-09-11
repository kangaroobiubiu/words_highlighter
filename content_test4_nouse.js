// ------------------------ 工具函数 ------------------------

// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// 转义正则特殊字符
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ------------------------ 高亮样式 ------------------------

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

// ------------------------ Trie 树构建 ------------------------

class TrieNode {
    constructor() {
        this.children = new Map();
        this.wordInfo = null; // { word, listIndex, textColor, bgColor }
    }
}

function buildTrie(lists) {
    const root = new TrieNode();

    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const words = list.words.split("\n").map(w => w.trim()).filter(Boolean);

        words.sort((a, b) => b.length - a.length); // 长词优先

        words.forEach(word => {
            let node = root;
            for (let char of word.toLowerCase()) {
                if (!node.children.has(char)) node.children.set(char, new TrieNode());
                node = node.children.get(char);
            }
            node.wordInfo = { word, listIndex, textColor: list.textColor, bgColor: list.bgColor };
        });
    });

    return root;
}

// ------------------------ 文本高亮 ------------------------

function highlightText(node, trieRoot) {
    if (node.nodeType !== 3) return;

    const parent = node.parentNode;
    if (!parent || /(script|style|textarea|input)/i.test(parent.tagName)) return;
    if (parent.classList && Array.from(parent.classList).some(c => c.startsWith("multi-highlighted-"))) return;

    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    let i = 0;
    while (i < text.length) {
        let nodeTrie = trieRoot;
        let matchEnd = -1;
        let matchInfo = null;

        for (let j = i; j < text.length; j++) {
            const char = text[j].toLowerCase();
            if (!nodeTrie.children.has(char)) break;
            nodeTrie = nodeTrie.children.get(char);
            if (nodeTrie.wordInfo) {
                matchEnd = j + 1;
                matchInfo = nodeTrie.wordInfo;
            }
        }

        if (matchEnd > i) {
            if (i < matchEnd) {
                if (i > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, i)));
                const span = document.createElement("span");
                span.className = `multi-highlighted-${matchInfo.listIndex}`;
                span.textContent = text.slice(i, matchEnd);
                frag.appendChild(span);
                lastIndex = matchEnd;
            }
            i = matchEnd;
        } else {
            i++;
        }
    }

    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));

    if (frag.childNodes.length) parent.replaceChild(frag, node);
}

// ------------------------ 批量处理 DOM ------------------------

function traverseAndHighlight(rootNode, trieRoot) {
    const nodes = Array.from(rootNode.childNodes);

    function processBatch(batchSize = 50) {
        let count = 0;

        function next() {
            if (nodes.length === 0) return;
            while (count < batchSize && nodes.length > 0) {
                const node = nodes.shift();
                if (node.nodeType === 3) highlightText(node, trieRoot);
                else if (node.nodeType === 1) {
                    if (!node.classList || !Array.from(node.classList).some(c => c.startsWith("multi-highlighted-"))) {
                        nodes.unshift(...Array.from(node.childNodes));
                    }
                }
                count++;
            }
            count = 0;
            if (nodes.length > 0) requestIdleCallback(next);
        }

        requestIdleCallback(next);
    }

    processBatch();
}

// ------------------------ 高亮刷新 ------------------------

function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;

        observer.disconnect(); // 暂停 observer

        injectStyles(lists);
        const trieRoot = buildTrie(lists);
        traverseAndHighlight(document.body, trieRoot);

        observer.observe(document.body, { childList: true, subtree: true }); // 恢复监听
    });
}

// ------------------------ MutationObserver ------------------------

const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;
        const trieRoot = buildTrie(lists);

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => traverseAndHighlight(node, trieRoot));
        });
    });
});

// ------------------------ URL 变化检测（SPA 支持） ------------------------

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        refreshHighlights();
    }
}).observe(document, { subtree: true, childList: true });

// ------------------------ 初始化 ------------------------

refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});

// 不可使用，会把opinion拆成o pin ion