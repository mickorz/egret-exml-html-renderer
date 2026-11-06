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
  // 原始 XML 声明统一从 native.attributes 取（完整快照，未被布局计算消费删除）；
  // 计算结果取 bounds；attrs 是渲染语义属性（构建器转换后剩余，含 _centerH 等合成标记）——仅 Advanced 展示
  function nativeAttrs(n) { return (n.native && n.native.attributes) || {}; }
  function hasV(v) { return v !== undefined && v !== null && v !== ""; }

  function renderTransform(n) {
    var body = document.createDocumentFragment();
    var na = nativeAttrs(n);
    // 原始 XML 声明与计算 bounds 分离展示（评审原则二：计算结果绝不伪装成原始属性）
    body.appendChild(sub("原始 XML 声明（native.attributes）"));
    body.appendChild(kv("x", na.x));
    body.appendChild(kv("y", na.y));
    body.appendChild(kv("width", na.width));
    body.appendChild(kv("height", na.height));
    body.appendChild(sub("计算 bounds（Scene Builder）"));
    var b = n.bounds || {};
    body.appendChild(kv("x", b.x));
    body.appendChild(kv("y", b.y));
    body.appendChild(kv("width", b.width));
    body.appendChild(kv("height", b.height));
    return body;
  }
  var LAYOUT_KEYS = ["left", "right", "top", "bottom", "horizontalCenter", "verticalCenter", "percentWidth", "percentHeight"];
  function renderLayout(n) {
    var na = nativeAttrs(n);
    var has = LAYOUT_KEYS.some(function (k) { return hasV(na[k]); });
    if (!has && !n.layout) return null; // 无布局约束且无 layout 对象：整组隐藏
    var body = document.createDocumentFragment();
    body.appendChild(sub("布局约束（原始 XML 声明）"));
    var shown = 0;
    LAYOUT_KEYS.forEach(function (k) {
      if (hasV(na[k])) { body.appendChild(kv(k, na[k])); shown++; }
    });
    if (!shown) body.appendChild(emptyNote("无布局约束属性"));
    body.appendChild(sub("layout 对象（e:layout 属性子元素）"));
    if (n.layout) {
      body.appendChild(kv("className", n.layout.className));
      body.appendChild(preBlock(n.layout.attrs || {}));
    } else body.appendChild(emptyNote("无 e:layout 声明"));
    return body;
  }
  function renderImage(n) {
    var na = nativeAttrs(n);
    var hasSource = hasV(na.source);
    if (!hasSource && !n.asset) return null; // 无 source 且无已解析资源：整组隐藏
    var body = document.createDocumentFragment();
    body.appendChild(sub("图像属性（原始 XML 声明）"));
    body.appendChild(kv("source", na.source));
    if (hasV(na.scale9Grid)) body.appendChild(kv("scale9Grid", na.scale9Grid));
    if (hasV(na.fillMode)) body.appendChild(kv("fillMode", na.fillMode));
    if (hasV(na.smooth)) body.appendChild(kv("smooth", na.smooth));
    body.appendChild(sub("资源解析（asset，Scene Builder）"));
    if (n.asset) {
      body.appendChild(kv("kind", n.asset.kind));
      body.appendChild(kv("file", n.asset.file));
      if (n.asset.frame) body.appendChild(kv("frame", JSON.stringify(n.asset.frame)));
    } else if (hasSource) {
      body.appendChild(emptyNote("资源未解析（素材缺失或未登记）")); // 不静默
    } else body.appendChild(emptyNote("无 source"));
    return body;
  }
  var TEXT_KEYS = ["text", "size", "bold", "italic", "fontFamily", "textAlign", "verticalAlign", "lineSpacing", "maxLines", "stroke", "strokeColor", "multiline"];
  var TEXT_COLOR_KEYS = { textColor: true, strokeColor: true };
  function renderText(n) {
    var na = nativeAttrs(n);
    var has = TEXT_KEYS.some(function (k) { return hasV(na[k]); }) || hasV(na.textColor);
    if (!has) return null; // 无文本属性：整组隐藏（Group/Rect 等不显示空 Text 组）
    var body = document.createDocumentFragment();
    body.appendChild(sub("文本属性（原始 XML 声明）"));
    TEXT_KEYS.forEach(function (k) {
      var v = na[k];
      if (!hasV(v)) return;
      if (TEXT_COLOR_KEYS[k]) body.appendChild(kv(k, colorValue(v)));
      else body.appendChild(kv(k, v));
    });
    if (hasV(na.textColor)) body.appendChild(kv("textColor", colorValue(na.textColor)));
    return body;
  }
  function renderComponent(n) {
    // 实例与来源分离（评审原则一）：展示当前实例节点的溯源信息（组件身份/来源文件/模拟标记）
    // 不把源皮肤的属性混入当前实例属性列表（当前实例自身的属性在上列各组）
    var na = nativeAttrs(n);
    var has = !!(n.component || n.srcFile || n.simulated || na.skinName || na.itemRendererSkinName);
    if (!has) return null; // 非组件实例节点：整组隐藏
    var body = document.createDocumentFragment();
    body.appendChild(sub("实例溯源（当前实例节点）"));
    if (n.component) {
      body.appendChild(kv("identity", n.component.identity));
      body.appendChild(kv("kind", n.component.kind));
      if (n.component.skinClass) body.appendChild(kv("skinClass", n.component.skinClass));
    }
    if (na.skinName) body.appendChild(kv("skinName（声明）", na.skinName));
    if (na.itemRendererSkinName) body.appendChild(kv("itemRendererSkinName（声明）", na.itemRendererSkinName));
    body.appendChild(sub("来源（Source）"));
    body.appendChild(kvCopy("来源文件 srcFile", n.srcFile));
    if (n.srcFile && ED.file && n.srcFile !== ED.file) body.appendChild(emptyNote("展开内容：子树来自源组件 EXML（当前文件仅为引用）"));
    else if (n.srcFile) body.appendChild(emptyNote("当前文件即来源（非展开内容）"));
    else body.appendChild(emptyNote("无展开来源（当前文件声明的节点）"));
    if (n.simulated) body.appendChild(emptyNote("模拟节点：静态预览示例值，非运行时真实数据"));
    if (n.native && n.native.tag && String(n.native.tag).indexOf("List:") === 0) body.appendChild(emptyNote("合成标签：" + n.native.tag + "（重建时自动再生）"));
    return body;
  }
  function renderAdvanced(n) {
    if (!n.attrs || !Object.keys(n.attrs).length) return null;
    var body = document.createDocumentFragment();
    body.appendChild(sub("渲染语义属性 attrs（构建器转换后剩余，合成标记含 _centerH/_right）"));
    body.appendChild(preBlock(n.attrs));
    body.appendChild(sub("原始 XML 属性 native.attributes（完整声明快照）"));
    body.appendChild(preBlock(nativeAttrs(n)));
    return body;
  }
  // Diagnostics 匹配优先级（评审修正四）：
  //   ① stableKey（诊断未携带，当前不可用）② instancePath（诊断未携带，当前不可用）
  //   ③ nodeId（id 存在且全文档唯一时关联）④ 否则不绑定，仅文档级展示。禁止 name 模糊匹配
  function matchNodeDiagnostics(n, doc) {
    var diags = (doc && doc.diagnostics) || [];
    if (!diags.length || !n.id) return [];
    // 全文档同 id 计数（合成展开会重复 id：重复时不关联，保守落文档级）
    var same = 0;
    ED.index.forEach(function (v) {
      if (v.node && v.node.id === n.id) same++;
    });
    if (same !== 1) return [];
    return diags.filter(function (d) { return d && d.nodeId === n.id; });
  }
  function diagRow(d, jumpKey) {
    var row = document.createElement("div");
    row.className = "diag " + (d.level === "error" ? "diag-err" : "diag-warn");
    if (jumpKey) {
      row.className += " diag-jump";
      row.title = "点击定位节点（Tree 与 Canvas）";
      row.onclick = function () { edSelect(jumpKey, "inspector"); };
    }
    var lv = document.createElement("span");
    lv.className = "lv";
    lv.textContent = "[" + (d.level || "info") + "] ";
    var tx = document.createElement("span");
    tx.textContent = (d.code || "") + " " + (d.message || "");
    row.appendChild(lv);
    row.appendChild(tx);
    return row;
  }
  // 诊断可跳转判定：nodeId 存在且全文档唯一（重复 id 不跳，与节点级匹配同一优先级；禁止 name 模糊匹配）
  function diagJumpKey(nodeId) {
    if (!nodeId || !ED.index) return null;
    var hit = null, same = 0;
    ED.index.forEach(function (v) {
      if (v.node && v.node.id === nodeId) { same++; if (same === 1) hit = v.node.key; }
    });
    return same === 1 ? hit : null;
  }
  function renderDiagnostics(n) {
    var doc = ED.doc;
    var nodeDiags = (doc && !doc.error) ? matchNodeDiagnostics(n, doc) : [];
    var selfNotes = [];
    (n.unsupported || []).forEach(function (u) { selfNotes.push({ level: "warning", code: "SCENE_NODE_UNSUPPORTED", message: u }); });
    if (n.simulated) selfNotes.push({ level: "info", code: "SCENE_NODE_SIMULATED", message: "静态预览模拟节点（运行时数据驱动）" });
    var allDiags = (doc && doc.diagnostics) || [];
    // id 非唯一但文档级存在同 nodeId 诊断：显式提示不绑定原因（避免「文档里有却未关联」疑惑）
    var dupHit = n.id && !nodeDiags.length && allDiags.some(function (d) { return d && d.nodeId === n.id; }) && (function () {
      var same = 0; ED.index.forEach(function (v) { if (v.node && v.node.id === n.id) same++; }); return same !== 1;
    })();
    if (!nodeDiags.length && !selfNotes.length && !allDiags.length && !dupHit) return null; // 全无诊断：整组隐藏
    var body = document.createDocumentFragment();
    if (selfNotes.length || nodeDiags.length) {
      body.appendChild(sub("当前节点相关（" + (selfNotes.length + nodeDiags.length) + "）"));
      selfNotes.forEach(function (d) { body.appendChild(diagRow(d)); });
      nodeDiags.forEach(function (d) { body.appendChild(diagRow(d)); });
      if (n.id && !nodeDiags.length) {
        var same = 0;
        ED.index.forEach(function (v) { if (v.node && v.node.id === n.id) same++; });
        if (same !== 1) body.appendChild(emptyNote("id 非全文档唯一（" + same + " 处，合成展开重复），诊断不绑定节点，见文档级"));
      }
    } else if (dupHit) {
      body.appendChild(sub("当前节点相关（0）"));
      body.appendChild(emptyNote("id 非全文档唯一（合成展开重复），诊断不绑定节点，见文档级"));
    }
    // 文档级默认折叠 + 计数（P3-D：诊断多的页面不再把 Inspector 撑长）
    var head = document.createElement("div");
    head.className = "insp-sub";
    head.textContent = "文档级 Diagnostics（全部 " + allDiags.length + "，点击" + (docDiagCollapsed ? "展开" : "折叠") + "）";
    body.appendChild(head);
    if (allDiags.length) {
      var listEl = document.createElement("div");
      listEl.className = "diag-list";
      if (docDiagCollapsed) listEl.style.display = "none";
      allDiags.forEach(function (d) { listEl.appendChild(diagRow(d, d.nodeId ? diagJumpKey(d.nodeId) : null)); });
      body.appendChild(listEl);
      head.onclick = function () {
        docDiagCollapsed = !docDiagCollapsed;
        listEl.style.display = docDiagCollapsed ? "none" : "";
        head.textContent = "文档级 Diagnostics（全部 " + allDiags.length + "，点击" + (docDiagCollapsed ? "展开" : "折叠") + "）";
      };
    } else body.appendChild(emptyNote("无诊断"));
    return body;
  }

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
  var docDiagCollapsed = true; // 文档级 Diagnostics 默认折叠（P3-D：计数可见，按需展开）

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
