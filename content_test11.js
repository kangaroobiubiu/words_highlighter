// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
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

// 注入样式（每个列表一次,会存在多个单词列表，不同单词列表的高亮效果不同）
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

    if (allWords.length === 0) return { regex: null, wordMap };

    const regex = new RegExp(`\\b(${allWords.map(w => escapeRegex(w.word)).join("|")})\\b`, "gi");
    return { regex, wordMap };
}

// 高亮文本节点
function highlightTextInNode(node, regex, wordMap) {
    if (node.nodeType === 1) {
        // 元素节点
        if (node.classList && Array.from(node.classList).some(c => c.startsWith("multi-highlighted-"))) {
            return; // 已高亮，跳过整个子树
        }
        if (node.isContentEditable) return;

        // 跳过动态生成回答区域 & 其他不想高亮的 UI
        const skipSelectors = [
            '.ai-answer-container',  // AI 回答生成区
            '#chat-output',
            '.view-line',            // 力扣的 代码编辑区
            'token'                  // 力扣题解
        ];
        const skipPrefixes = ['hljs-','language-'];

        if (
            skipSelectors.some(sel => node.matches(sel) || node.closest(sel)) ||
            (node.classList && Array.from(node.classList).some(cls =>
                skipPrefixes.some(prefix => cls.startsWith(prefix))
            ))
        ) return;

        Array.from(node.childNodes).forEach(child => highlightTextInNode(child, regex, wordMap));
    } else if (node.nodeType === 3) {
        // 文本节点
        const parent = node.parentNode;
        if (!parent) return;
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
}

// 分批高亮 DOM
function highlightAllListsBatched(lists) {
    clearHighlights();
    injectStyles(lists);

    const { regex, wordMap } = buildWordMapAndRegex(lists);
    if (!regex || wordMap.size === 0) return;

    const nodes = Array.from(document.body.childNodes);

    function processBatch(batchSize = 300) {
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

// 定义 observer，先创建但暂不启动
const observer = new MutationObserver(mutations => {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;
        const { regex, wordMap } = buildWordMapAndRegex(lists);

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                highlightTextInNode(node, regex, wordMap);
            });
        });
    });
});

// 需要排除的域名或网址（黑名单模式）
const excludedSites = [
    // "leetcode.cn",     // 力扣
    "chatgpt.com" // ChatGPT
];

// 检查当前站点是否在排除列表
function isExcludedSite() {
    return excludedSites.some(site => window.location.hostname.includes(site));
}

// 刷新高亮（安全处理 observer）
function refreshHighlights() {
    if (isExcludedSite()) {
        console.log("当前站点在排除列表中，跳过高亮");
        return; // 不执行任何高亮逻辑
    }

    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        if (lists.length === 0) return;

        observer.disconnect(); // 暂时停止监听
        highlightAllListsBatched(lists);
        observer.observe(document.body, { childList: true, subtree: true }); // 恢复监听
        // 注意：不启用 characterData，避免光标移动异常
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});