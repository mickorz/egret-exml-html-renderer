// 工程组件树（P3-A P0）：/api/exml 扁平列表 -> 目录树 + 三模式搜索 + 打开文件 + 定位
// 数据来源复用既有接口：/api/exml（全量列表）、/api/ui-assets（搜索，三条件参数）
// 搜索命中时树区切换为平铺结果列表（P2-C 行样式迁移）；清空恢复目录树

export function projectTreeScript(): string {
  return `
// ---- 工程组件树（project-tree） ----
(function () {
  var treeEl = document.getElementById("proj-tree");
  var qEl = document.getElementById("pt-q");
  var infoEl = document.getElementById("pt-info");
  var modesEl = document.getElementById("pt-modes");
  var locateBtn = document.getElementById("pt-locate");
  var allFiles = [];
  var searchResults = null; // null = 目录树模式；数组 = 搜索结果模式
  var searchSeq = 0;       // 请求序号：连续搜索时旧响应丢弃，防止覆盖新结果
  var SEARCH_LIMIT = 300;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // 扁平文件列表 -> 目录树
  function buildDirTree(files) {
    var root = { dirs: {}, files: [] };
    files.forEach(function (f) {
      var parts = f.file.split("/");
      var node = root;
      for (var i = 0; i < parts.length - 1; i++) {
        node = node.dirs[parts[i]] || (node.dirs[parts[i]] = { dirs: {}, files: [] });
      }
      node.files.push(f);
    });
    return root;
  }
  function countFiles(dir) {
    var n = dir.files.length;
    for (var k in dir.dirs) n += countFiles(dir.dirs[k]);
    return n;
  }

  // 目录行 / 文件行
  function dirRow(name, dir, path, depth) {
    var el = document.createElement("div");
    var expanded = !!ED.ptExpanded[path];
    el.className = "row dir";
    el.dataset.path = path;
    el.style.paddingLeft = (8 + depth * 12) + "px";
    el.innerHTML = '<span class="caret">' + (expanded ? "-" : "+") + '</span>' +
      '<span class="icon">D</span>' +
      '<span class="lbl">' + esc(name) + '</span>' +
      '<span class="badge cnt">' + countFiles(dir) + '</span>';
    el.onclick = function () { ED.ptExpanded[path] = !ED.ptExpanded[path]; renderTree(); };
    return el;
  }
  function fileRow(file, depth, rootClass, meta) {
    var el = document.createElement("div");
    el.className = "row file" + (ED.file === file ? " sel" : "");
    el.dataset.file = file;
    el.style.paddingLeft = (8 + depth * 12) + "px";
    var name = file.split("/").pop();
    el.innerHTML = '<span class="caret"></span>' +
      '<span class="icon">E</span>' +
      '<span class="lbl" title="' + esc(file) + '">' + esc(name) + (rootClass ? ' <span class="id">' + esc(rootClass) + '</span>' : '') + '</span>' +
      (meta ? '<span class="badge cnt">' + esc(meta) + '</span>' : '');
    el.onclick = function () { edOpenFile(file); };
    return el;
  }

  // 渲染：目录树模式（未展开目录不生成子 DOM）或搜索结果平铺模式
  function renderTree() {
    treeEl.innerHTML = "";
    if (searchResults) {
      if (!searchResults.length) { treeEl.innerHTML = '<div class="empty">无命中结果</div>'; return; }
      searchResults.slice(0, SEARCH_LIMIT).forEach(function (en) {
        treeEl.appendChild(fileRow(en.basic.file, 0, en.basic.rootClass, en.basic.nodeCount + "节点"));
      });
      if (searchResults.length > SEARCH_LIMIT) {
        var more = document.createElement("div");
        more.className = "empty";
        more.textContent = "仅显示前 " + SEARCH_LIMIT + " 条（共 " + searchResults.length + "）";
        treeEl.appendChild(more);
      }
      return;
    }
    var root = buildDirTree(allFiles);
    // 默认展开第一级目录（仅一次）
    if (!ED.ptExpanded.__inited) {
      ED.ptExpanded.__inited = true;
      for (var k in root.dirs) ED.ptExpanded[k] = true;
    }
    function walkDir(dir, path, depth) {
      Object.keys(dir.dirs).sort().forEach(function (nm) {
        var childPath = path ? path + "/" + nm : nm;
        treeEl.appendChild(dirRow(nm, dir.dirs[nm], childPath, depth));
        if (ED.ptExpanded[childPath]) walkDir(dir.dirs[nm], childPath, depth + 1);
      });
      dir.files.forEach(function (f) { treeEl.appendChild(fileRow(f.file, depth)); });
    }
    walkDir(root, "", 0);
  }

  // 三模式搜索（复用 /api/ui-assets：file/class/component 参数）
  var mode = "file";
  modesEl.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mode]");
    if (!b) return;
    mode = b.dataset.mode;
    modesEl.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
    b.classList.add("active");
    if (qEl.value.trim()) doSearch();
  });
  function doSearch() {
    var v = qEl.value.trim();
    var seq = ++searchSeq;
    if (!v) { searchResults = null; infoEl.textContent = "全部 " + allFiles.length + " 个 EXML"; renderTree(); return; }
    infoEl.textContent = "搜索中...";
    fetch("/api/ui-assets?" + mode + "=" + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (res) {
      if (seq !== searchSeq) return; // 过期响应丢弃（已发起更新的搜索）
      searchResults = res.entries;
      infoEl.textContent = "命中 " + res.count + " / " + res.stats.entryCount + "（" + Math.round(res.stats.buildMs) + "ms）";
      renderTree();
    }).catch(function (err) {
      if (seq !== searchSeq) return; // 过期响应丢弃
      infoEl.textContent = "搜索失败: " + err;
    });
  }
  qEl.addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });

  // 定位当前打开文件：展开路径目录链 + 滚动 + 闪烁
  locateBtn.onclick = function () {
    if (!ED.file) { infoEl.textContent = "尚未打开文件"; return; }
    searchResults = null;
    if (qEl.value) { qEl.value = ""; }
    var parts = ED.file.split("/");
    var path = "";
    for (var i = 0; i < parts.length - 1; i++) {
      path = path ? path + "/" + parts[i] : parts[i];
      ED.ptExpanded[path] = true;
    }
    renderTree();
    // 不拼属性选择器（文件名可能含特殊字符）：遍历比较 dataset
    var rows = treeEl.querySelectorAll(".row.file");
    var row = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].dataset.file === ED.file) { row = rows[i]; break; } }
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.style.background = "#4a6a8a";
      setTimeout(function () { row.style.background = ""; }, 800);
    }
  };

  // 状态订阅：文档变化刷新当前文件高亮（重渲染代价可接受，避免双份行状态）
  edSubscribe(function () {
    if (allFiles.length) renderTree();
  });

  // 初始化：全量文件列表
  fetch("/api/exml").then(function (r) { return r.json(); }).then(function (data) {
    allFiles = data.files;
    infoEl.textContent = "全部 " + allFiles.length + " 个 EXML";
    renderTree();
  }).catch(function (err) {
    treeEl.innerHTML = '<div class="err">文件列表加载失败: ' + esc(String(err)) + '</div>';
  });
})();
`;
}
