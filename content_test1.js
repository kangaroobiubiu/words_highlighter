// 转义 HTML
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// 转义正则特殊字符
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 高亮文本，按多个列表
function highlightAllLists(lists) {
    if (!lists || lists.length === 0) return;

    // 生成所有单词列表并记录所属列表
    let allWords = [];
    lists.forEach((list, listIndex) => {
        if (!list.enabled) return;
        const arr = list.words.split("\n").map(w => w.trim()).filter(Boolean);
        arr.forEach(word => {
            allWords.push({
                word,
                listIndex,
                textColor: list.textColor,
                bgColor: list.bgColor
            });
        });
    });

    if (allWords.length === 0) return;

    // 按长度降序，保证长词优先匹配
    allWords.sort((a, b) => b.word.length - a.word.length);

    // 构建正则
    const regex = new RegExp(`\\b(${allWords.map(w => escapeRegex(w.word)).join("|")})\\b`, "gi");

    // 动态注入样式（每个列表一个样式）
    allWords.forEach(w => {
        const className = `multi-highlighted-${w.listIndex}`;
        const styleId = `style-${className}`;
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
              .${className} {
                color: ${w.textColor} !important;
                background-color: ${w.bgColor} !important;
                font-weight: bold;
                padding: 0 2px;
                border-radius: 2px;
              }
            `;
            document.head.appendChild(style);
        }
    });

    // 遍历 DOM 节点
    function walk(node) {
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

                const info = allWords.find(w => w.word.toLowerCase() === match.toLowerCase());
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
            Array.from(node.childNodes).forEach(walk);
        }
    }

    walk(document.body);
}

// 清除旧高亮
function clearHighlights() {
    document.querySelectorAll('[class^="multi-highlighted-"]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize(); // 合并相邻文本节点
        }
    });
}

// 刷新高亮
function refreshHighlights() {
    clearHighlights();
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        highlightAllLists(lists);
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});


// 尝试解决
// 存在待解决的问题:比如hedge fund，hedge和fund在list1中是两个单独的词，hedge fund在list2中是一个短语，显示的是list1中的高亮效果；
// 所有列表单词合并，按长度降序匹配 → 长词优先。
//
// 每个列表生成独立的 CSS 类 → 不同列表高亮互不覆盖。
//
// 支持大量单词列表，无需担心 hedge 和 hedge fund 冲突。
//
// 清除旧高亮避免重复嵌套。