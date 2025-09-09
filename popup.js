const listsContainer = document.getElementById("listsContainer");
const addListBtn = document.getElementById("addList");
const saveBtn = document.getElementById("saveBtn");
const importFile = document.getElementById("importFile");
// 导入文件按钮
const importBtn = document.getElementById("importBtn");

// 初始化加载已保存列表
chrome.storage.local.get("lists", data => {
    const lists = data.lists || [];
    lists.forEach(addListElement);
});

// 添加列表元素
function addListElement(list = { name: "", words: "", textColor: "#000000", bgColor: "#ffff00", enabled: true }) {
    const div = document.createElement("div");
    div.className = "list-item";

    div.innerHTML = `
    <label>列表名称: <input type="text" class="list-name" value="${list.name}"></label>
    <label>单词/习语 (换行分隔):</label>
    <textarea class="list-words">${list.words}</textarea>
    <label>文字颜色: <input type="color" class="textColor" value="${list.textColor}"></label>
    <label>背景颜色: <input type="color" class="bgColor" value="${list.bgColor}"></label>
    <label><input type="checkbox" class="enabled" ${list.enabled ? "checked" : ""}> 启用</label>
    <button class="removeList">删除列表</button>
  `;

    div.querySelector(".removeList").onclick = () => div.remove();

    listsContainer.appendChild(div);
}

// 点击添加新列表
addListBtn.onclick = () => addListElement();

// 点击保存
saveBtn.onclick = () => {
    const lists = Array.from(listsContainer.children).map(div => ({
        name: div.querySelector(".list-name").value,
        words: div.querySelector(".list-words").value,
        textColor: div.querySelector(".textColor").value,
        bgColor: div.querySelector(".bgColor").value,
        enabled: div.querySelector(".enabled").checked
    }));

    chrome.storage.local.set({ lists }, () => {
        alert("已保存列表！");
        // 通知 content.js 更新   也就是保存后才会更新变化
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.tabs.sendMessage(tabs[0].id, { type: "update" });
        });
    });
};


// 点击导入文件按钮触发，隐藏的input 也就是执行下方的importFile.addEventListener
importBtn.addEventListener("click", () => importFile.click());

// 文件导入 txt/csv
importFile.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
        const text = event.target.result;
        addListElement({ name: file.name, words: text, textColor: "#000000", bgColor: "#ffff00", enabled: true });
    };
    reader.readAsText(file);
});
