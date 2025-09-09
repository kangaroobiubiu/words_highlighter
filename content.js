function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}// 在匹配的字符前加\

// 高亮一个单词列表
// 高亮单词-主程序
function highlightWords(words, textColor, bgColor, listId) {
    if (!words || words.length === 0) return;

    const className = `multi-highlighted-${listId}`;
    const styleId = `style-${className}`;

    // 动态注入样式（每个列表一个样式）
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          .${className} {
            color: ${textColor} !important;
            background-color: ${bgColor} !important;
            font-weight: bold;
            padding: 0 2px;
            border-radius: 2px;
          }
        `;
        document.head.appendChild(style);
    }

    // 合并所有单词成一个正则，提高效率
    const wordList = words
        .split("\n")
        .map(w => w.trim())
        .filter(Boolean);

    if (wordList.length === 0) return;

    const regex = new RegExp(`\\b(${wordList.map(escapeRegex).join("|")})\\b`, "gi");


    // 遍历 DOM 节点
    function walk(node) {
        if (node.nodeType === 3) {
            const parent = node.parentNode;
            if (!parent || parent.classList?.contains(className)) return; // ✅ 已高亮跳过

            const text = node.nodeValue;
            if (!regex.test(text)) return;

            const frag = document.createDocumentFragment();
            let lastIndex = 0;

            text.replace(regex, (match, _, offset) => {
                if (offset > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
                }
                const span = document.createElement("span");
                span.className = className;
                span.textContent = match;
                frag.appendChild(span);
                lastIndex = offset + match.length;
            });

            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            parent.replaceChild(frag, node);
        } else if (node.nodeType === 1 && node.childNodes && !/(script|style|textarea|input)/i.test(node.tagName)) {
            Array.from(node.childNodes).forEach(walk);
        }
    }

    walk(document.body);
}

// 刷新所有高亮
function refreshHighlights() {
    // ✅ 每次刷新前先清除旧的高亮，防止重复嵌套
    document.querySelectorAll('[class^="multi-highlighted-"]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize(); // 合并相邻文本节点
        }
    });

    chrome.storage.local.get("lists", data => {
        const lists = data.lists || [];
        lists.forEach((list, index) => {
            if (list.enabled) {
                highlightWords(list.words, list.textColor, list.bgColor, index);
            }
        });
    });
}

// 初次加载
refreshHighlights();

// 接收 popup 消息更新
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "update") refreshHighlights();
});




// 下面是原来的函数

//
//     function walk(node) {
//         if (node.nodeType === 3) {
//             const parent = node.parentNode;
//             let text = node.nodeValue;
//             let replaced = false;
//
//             words.split("\n").forEach(word => {
//                 word = word.trim();
//                 if (!word) return;
//                 const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, "gi");
//                 if (regex.test(text)) {
//                     replaced = true;
//                     text = text.replace(regex, `<span class="${className}">$1</span>`);
//                 }
//             });
//
//             if (replaced) {
//                 const temp = document.createElement("span");
//                 temp.innerHTML = text;
//                 parent.replaceChild(temp, node);
//             }
//         } else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName)) {
//             Array.from(node.childNodes).forEach(walk);
//         }
//     }
//
//     walk(document.body);
// }
//
//
//
// // 启用所有列表 为每个列表都加一个index 编号  确保每个列表都有不同的高亮配置
// function refreshHighlights() {
//     chrome.storage.local.get("lists", data => {
//         const lists = data.lists || [];
//         lists.forEach((list, index) => {
//             if (list.enabled) {
//                 highlightWords(list.words, list.textColor, list.bgColor, index);
//             }
//         });
//     });
// }
//
//
// // 初次加载
// refreshHighlights();
//
// // 接收 popup 消息更新
// chrome.runtime.onMessage.addListener(msg => {
//     if (msg.type === "update") refreshHighlights();
// });
