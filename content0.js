function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 高亮一个单词列表
function highlightWords(words, textColor, bgColor) {
    if (!words || words.length === 0) return;

    const styleId = "multi-highlight-style";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
      .multi-highlighted {
        color: ${textColor} !important;
        background-color: ${bgColor} !important;
        font-weight: bold;
        padding: 0 2px;
        border-radius: 2px;
      }
    `;
        document.head.appendChild(style);
    }

    function walk(node) {
        if (node.nodeType === 3) { // 文本节点
            const parent = node.parentNode;
            let text = node.nodeValue;
            let replaced = false;

            words.split("\n").forEach(word => {
                word = word.trim();
                if (!word) return;
                const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, "gi");
                if (regex.test(text)) {
                    replaced = true;
                    text = text.replace(regex, `<span class="multi-highlighted">$1</span>`);
                }
            });

            if (replaced) {
                const temp = document.createElement("span");
                temp.innerHTML = text;
                parent.replaceChild(temp, node);
            }
        } else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName)) {
            Array.from(node.childNodes).forEach(walk);
        }
    }

    walk(document.body);
}

// 应用所有启用的列表
function refreshHighlights() {
    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        lists.forEach(list => {
            if (list.enabled) highlightWords(list.words, list.textColor, list.bgColor);
        });
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});
