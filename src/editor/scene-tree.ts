// Scene Tree（P3-A P1）：/api/scene nodes 递归 + 根行（rootKey）-> 按需展开的节点树
// 标记徽章：展开（srcFile != 当前文件）/ 模拟（simulated）/ 合成（List:* 合成标签）
// 点击行为：行点击 = 选中节点（edSelect -> Canvas 高亮）；caret 独立点击 = 展开/折叠（不触发选中）
// Canvas 来源的选择：自动展开父链 + 滚动定位 + 闪烁（P1-D）

export function sceneTreeScript(): string {
  return `
// ---- Scene Tree（scene-tree） ----
(function () {
  var treeEl = document.getElementById("scene-tree");
  var infoEl = document.getElementById("st-info");
  var lastInitDoc = null; // 默认展开绑定文档对象身份：加载中(doc=null)与加载完成(新对象)间 docId 不变，绑 docId 会漏初始化
  var lastSel = null;     // 上次选择的 key（用于识别"选择变化"并定位）

  var ICON = { group: "G", container: "G", image: "I", label: "L", button: "B", rect: "R", scroller: "S", bitmapnumber: "N", animation: "A", skin: "K", custom: "X" };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function nodeRow(key, depth) {
    var entry = ED.index && ED.index.get(key);
    if (!entry) return null;
    var n = entry.node;
    var kids = n.children || [];
    var expanded = !!ED.stExpanded[key];
    var el = document.createElement("div");
    el.className = "row node" + (ED.sel === key ? " sel" : "");
    el.dataset.key = key;
    el.style.paddingLeft = (8 + depth * 14) + "px";
    var ident = n.name || n.id || "";
    var html = '<span class="caret' + (kids.length ? ' clk' : '') + '">' + (kids.length ? (expanded ? "-" : "+") : "") + '</span>' +
      '<span class="icon">' + (ICON[n.type] || "·") + '</span>' +
      '<span class="lbl" title="' + esc(key) + '">' + esc(n.type) + (ident ? ' <span class="id">' + esc(ident) + '</span>' : '') + '</span>';
    if (n.srcFile && n.srcFile !== ED.file) html += '<span class="badge exp" title="' + esc(n.srcFile) + '">展开</span>';
    if (n.simulated) html += '<span class="badge sim">模拟</span>';
    if (n.native && n.native.tag && n.native.tag.indexOf("List:") === 0) html += '<span class="badge syn">合成</span>';
    el.innerHTML = html;
    // 行点击 = 仅选中（P1-A：Store 驱动，Canvas 同步高亮）
    el.onclick = function () { edSelect(key, "tree"); };
    // caret 独立点击 = 仅展开/折叠（不触发选中；体验对齐 Unity/Figma 树形交互）
    if (kids.length) {
      el.querySelector(".caret").onclick = function (e) {
        e.stopPropagation();
        ED.stExpanded[key] = !ED.stExpanded[key];
        render();
      };
    }
    return el;
  }

  function render() {
    if (!ED.file) {
      treeEl.innerHTML = '<div class="empty">打开左侧 EXML 后展示节点结构</div>';
      infoEl.textContent = "";
      return;
    }
    if (!ED.doc) {
      treeEl.innerHTML = '<div class="empty">Scene JSON 加载中...</div>';
      infoEl.textContent = "";
      return;
    }
    if (ED.doc.error) {
      treeEl.innerHTML = '<div class="err">Scene JSON 加载失败: ' + esc(ED.doc.error) + '<br/><button onclick="edOpenFile(ED.file)">重试</button></div>';
      infoEl.textContent = "";
      return;
    }
    treeEl.innerHTML = "";
    var rootKey = ED.doc.rootKey;
    if (!rootKey) {
      // 理论不出现（toSceneJson 已补 rootKey）；防御性提示而非静默
      treeEl.innerHTML = '<div class="err">文档缺少 rootKey，无法构建树</div>';
      return;
    }
    function walk(key, depth) {
      var row = nodeRow(key, depth);
      if (!row) return;
      treeEl.appendChild(row);
      if (ED.stExpanded[key]) {
        var entry = ED.index.get(key);
        var kids = (entry.node.children || []);
        for (var i = 0; i < kids.length; i++) walk(kids[i].key, depth + 1);
      }
    }
    walk(rootKey, 0);
    infoEl.textContent = ED.index.size + " 节点";
  }

  // 默认展开：根 + 第一层（需求 4.2.4）
  function initExpansion() {
    var rootKey = ED.doc && ED.doc.rootKey;
    if (!rootKey || !ED.index) return;
    ED.stExpanded = {};
    ED.stExpanded[rootKey] = true;
    var entry = ED.index.get(rootKey);
    var kids = (entry && entry.node.children) || [];
    for (var i = 0; i < kids.length; i++) ED.stExpanded[kids[i].key] = true;
  }

  // Canvas 来源的选择：展开父链 + 滚动定位 + 闪烁（P1-D）
  function revealSelection() {
    if (!ED.sel || !ED.index) return;
    var entry = ED.index.get(ED.sel);
    if (!entry) return;
    var k = entry.parentKey;
    while (k) {
      ED.stExpanded[k] = true;
      var p = ED.index.get(k);
      k = p && p.parentKey;
    }
    render();
    var rows = treeEl.querySelectorAll(".row.node");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.key === ED.sel) {
        rows[i].scrollIntoView({ block: "nearest" });
        rows[i].style.background = "#4a6a8a";
        (function (r) { setTimeout(function () { r.style.background = ""; }, 800); })(rows[i]);
        return;
      }
    }
  }

  edSubscribe(function () {
    // 文档数据加载完成（新 doc 对象且非错误）：初始化默认展开；重试成功（docId 不变）也会重置
    if (ED.doc && !ED.doc.error && ED.doc !== lastInitDoc) {
      lastInitDoc = ED.doc;
      initExpansion();
    }
    // 选择变化且来源 Canvas：展开父链并定位到对应行
    if (ED.sel !== lastSel) {
      lastSel = ED.sel;
      if (ED.sel && ED.source === "canvas") revealSelection();
    }
    render();
  });
})();
`;
}
