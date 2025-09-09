// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// Trie 树节点
class TrieNode {
    constructor() {
        this.children = {};
        this.isEnd = false;
        this.wordInfo = null; // { word, listIndex, textColor, bgColor }
    }
}

// Trie 树
class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(word, info) {
        let node = this.root;
        for (const char of word.toLowerCase()) {
            if (!node.children[char]) node.children[char] = new TrieNode();
            node = node.children[char];
        }
        node.isEnd = true;
        node.wordInfo = info;
    }

    // 返回匹配到的最长单词信息
    searchLongest(text, start) {
        let node = this.root;
        let maxLen = 0;
        let info = null;
        for (let i = start; i < text.length; i++) {
            const char = text[i].toLowerCase();
            if (!node.children[char]) break;
            node = node.children[char];
            if (node.isEnd) {
                maxLen = i - start + 1;
                info = node.wordInfo;
            }
        }
        return info ? { length: maxLen, info } : null;
    }
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

// 构建 Trie 树
function buildTrie(lists) {
    const trie = new Trie();
    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const arr = list.words.split("\n").map(w => w.trim()).filter(Boolean);
        arr.forEach(word => {
            trie.insert(word, { word, listIndex, textColor: list.textColor, bgColor: list.bgColor });
        });
    });
    return trie;
}

// 高亮文本节点
function highlightTextNode(node, trie) {
    if (node.nodeType !== 3) return;

    const parent = node.parentNode;
    if (!parent || /(script|style|textarea|input)/i.test(parent.tagName)) return;

    const text = node.nodeValue;
    let frag = document.createDocumentFragment();
    let index = 0;

    while (index < text.length) {
        const match = trie.searchLongest(text, index);
        if (match) {
            if (match.length > 0) {
                if (index < matchStart) {
                    frag.appendChild(document.createTextNode(text.slice(index, index + matchStart - index)));
                }
                const span = document.createElement("span");
                span.className = `multi-highlighted-${match.info.listIndex}`;
                span.textContent = text.substr(index, match.length);
                frag.appendChild(span);
                index += match.length;
            } else {
                frag.appendChild(document.createTextNode(text[index]));
                index++;
            }
        } else {
            frag.appendChild(document.createTextNode(text[index]));
            index++;
        }
    }

    parent.replaceChild(frag, node);
}

// 分块遍历 DOM 高亮
function walkDOMBatched(nodes, trie, batchSize = 50) {
    function processBatch() {
        let count = 0;
        while (count < batchSize && nodes.length > 0) {
            const node = nodes.shift();
            highlightTextNode(node, trie);
            if (node.childNodes) {
                nodes.unshift(...Array.from(node.childNodes));
            }
            count++;
        }
        if (nodes.length > 0) requestIdleCallback(processBatch);
    }
    requestIdleCallback(processBatch);
}

// 主刷新函数
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;

        clearHighlights();
        injectStyles(lists);
        const trie = buildTrie(lists);

        const nodes = Array.from(document.body.childNodes);
        walkDOMBatched(nodes, trie);
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});

// 监听新增节点，增量高亮
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;
        const trie = buildTrie(lists);

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                walkDOMBatched([node], trie);
            });
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });

// Trie 树版本的高亮插件，目标是：
//
// 支持 几十万条单词高亮
//
// 长词优先匹配
//
// 多列表高亮互不覆盖
//
// 增量更新 DOM
//
// 不卡顿、可分批处理