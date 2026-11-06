// Inspector（P3-A P2）：节点属性检查器 —— 只读 Scene JSON（ED.index），禁止从 DOM/CSS 反推
// 八组属性（执行计划 3.6 / 评审三原则）：
//   Basic（节点身份）/ Transform（原始与计算分离）/ Layout（布局约束）/ Image（资源解析）
//   Text（文本属性）/ Component（组件溯源：实例与来源分离）/ Advanced（attrs JSON，默认折叠）/ Diagnostics（稳定身份匹配）
// DOM 安全（评审 P2-02）：动态值一律 DOM API + textContent 或 esc() 转义，外部工程数据不裸拼 innerHTML
// 空分组隐藏（评审 P2-03）：分组无对应数据时整组不渲染，不显示无意义空字段

export function inspectorScript(): string {
  return `
// ---- Inspector（inspector） ----
(function () {
  var el = document.getElementById("inspector");
  var EMPTY = '<div class="empty">请选择一个节点<br/><br/>在左侧 Scene Tree 或中间 Canvas<br/>点击一个节点查看它的属性。</div>';

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // kv 行：DOM API 构建 + textContent 赋值（动态数据不拼 innerHTML）
  function kv(k, v) {
    var row = document.createElement("div");
    row.className = "kv";
    var ke = document.createElement("span");
    ke.className = "k";
    ke.textContent = k;
    var ve = document.createElement("span");
    ve.className = "v";
    if (v === null || v === undefined || v === "") ve.textContent = "—";
    else if (typeof v === "object" && v.nodeType) ve.appendChild(v);
    else ve.textContent = String(v);
    row.appendChild(ke);
    row.appendChild(ve);
    return row;
  }
  // 值 + 复制按钮（key / srcFile 等）
  function kvCopy(k, v) {
    var ve = document.createElement("span");
    var txt = document.createElement("span");
    txt.textContent = v == null ? "—" : String(v);
    ve.appendChild(txt);
    if (v != null && String(v).length) {
      var btn = document.createElement("button");
      btn.textContent = "复制";
      btn.onclick = function () {
        var s = String(v);
        if (navigator.clipboard) navigator.clipboard.writeText(s).then(function () { btn.textContent = "已复制"; setTimeout(function () { btn.textContent = "复制"; }, 900); });
        else btn.textContent = "无法复制";
      };
      ve.appendChild(btn);
    }
    return kv(k, ve);
  }
  // 小节标题（组内分原始/计算等来源小节，保证可追溯 P2-01）
  function sub(title) {
    var d = document.createElement("div");
    d.className = "insp-sub";
    d.textContent = title;
    return d;
  }
  // 颜色值（0xRRGGBB / #RRGGBB）：色块 + 原值
  function colorValue(v) {
    var ve = document.createElement("span");
    var raw = String(v);
    var hex = null;
    var m = /^(?:0x|#)?([0-9a-fA-F]{6})$/.exec(raw.trim());
    if (m) hex = "#" + m[1].toLowerCase();
    if (hex) {
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = hex;
      ve.appendChild(sw);
    }
    var t = document.createElement("span");
    t.textContent = raw;
    ve.appendChild(t);
    return ve;
  }
  // pre 代码块（JSON 展示；textContent 安全）
  function preBlock(obj) {
    var pre = document.createElement("pre");
    pre.textContent = JSON.stringify(obj, null, 1);
    return pre;
  }
  function emptyNote(text) {
    var d = document.createElement("div");
    d.className = "none";
    d.textContent = text;
    return d;
  }

  // ---- 分组渲染（P2-B/C/D 逐阶段填充；返回 null = 整组隐藏） ----
  function renderBasic(n) {
    var body = document.createDocumentFragment();
    body.appendChild(kv("类型 type", n.type));
    body.appendChild(kv("名称 name", n.name));
    body.appendChild(kv("标识 id", n.id));
    body.appendChild(kvCopy("key (stableKey)", n.key));
    body.appendChild(kvCopy("实例路径 path", n.path));
    return body;
  }
  function renderTransform(n) { return null; }   // P2-B
  function renderLayout(n) { return null; }      // P2-B
  function renderImage(n) { return null; }       // P2-B
  function renderText(n) { return null; }        // P2-B
  function renderComponent(n) { return null; }   // P2-C
  function renderAdvanced(n) { return null; }    // P2-B
  function renderDiagnostics(n) { return null; } // P2-D

  var GROUPS = [
    { id: "basic", title: "Basic 节点身份", render: renderBasic },
    { id: "transform", title: "Transform 变换", render: renderTransform },
    { id: "layout", title: "Layout 布局", render: renderLayout },
    { id: "image", title: "Image 图像", render: renderImage },
    { id: "text", title: "Text 文本", render: renderText },
    { id: "component", title: "Component 组件溯源", render: renderComponent },
    { id: "advanced", title: "Advanced 高级属性", render: renderAdvanced },
    { id: "diagnostics", title: "Diagnostics 诊断", render: renderDiagnostics }
  ];
  var collapsed = { advanced: true }; // Advanced 默认折叠（复杂节点 attrs 长）

  function groupEl(g, node) {
    var body = g.render(node);
    if (!body) return null; // 无数据整组隐藏（P2-03）
    var grp = document.createElement("div");
    grp.className = "grp";
    var head = document.createElement("div");
    head.className = "grp-head";
    var caret = document.createElement("span");
    caret.className = "caret" + (body.childNodes.length ? " clk" : "");
    caret.textContent = body.childNodes.length ? (collapsed[g.id] ? "+" : "-") : "";
    var title = document.createElement("span");
    title.textContent = g.title;
    head.appendChild(caret);
    head.appendChild(title);
    grp.appendChild(head);
    if (body.childNodes.length) {
      var bodyEl = document.createElement("div");
      bodyEl.className = "grp-body";
      if (collapsed[g.id]) bodyEl.style.display = "none";
      while (body.childNodes.length) bodyEl.appendChild(body.firstChild);
      grp.appendChild(bodyEl);
      head.onclick = function () {
        collapsed[g.id] = !collapsed[g.id];
        caret.textContent = collapsed[g.id] ? "+" : "-";
        bodyEl.style.display = collapsed[g.id] ? "none" : "";
      };
    }
    return grp;
  }

  function render() {
    if (!ED.sel) { el.innerHTML = EMPTY; return; }
    var entry = ED.index && ED.index.get(ED.sel);
    if (!entry) {
      // 选择过期（文档已切换但 key 残留）：不静默，明确提示
      el.innerHTML = "";
      var d = document.createElement("div");
      d.className = "empty";
      d.textContent = "选中节点不在当前文档索引中: " + ED.sel;
      el.appendChild(d);
      return;
    }
    var n = entry.node;
    el.innerHTML = "";
    // 节点标题（type + name/id + 模拟徽标）
    var head = document.createElement("div");
    head.className = "insp-head";
    var ht = document.createElement("span");
    ht.textContent = (n.type || "?") + (n.name || n.id ? " " + (n.name || n.id) : "");
    head.appendChild(ht);
    if (n.simulated) {
      var b = document.createElement("span");
      b.className = "badge sim";
      b.textContent = "模拟";
      head.appendChild(b);
    }
    el.appendChild(head);
    GROUPS.forEach(function (g) {
      var ge = groupEl(g, n);
      if (ge) el.appendChild(ge);
    });
  }

  edSubscribe(render);
  el.innerHTML = EMPTY;
})();
`;
}
