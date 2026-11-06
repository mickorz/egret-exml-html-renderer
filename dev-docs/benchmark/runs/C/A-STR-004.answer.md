{
  "file": "resource/skins/homeTown/HometownRebateView.exml",
  "question": "场景里 id 为 _imgLine1 的节点出现了几次？stableKey 分别是什么？为什么出现多次？是否为 HometownRebateView.exml 直接声明的节点？",
  "occurrenceCount": 3,
  "occurrences": [
    {
      "listItemIndex": 0,
      "stableKey": "HometownRebateItemRender#0.1.9.0.0.i0.0.2.1",
      "stableKeyAliasInToolOutput": "HometownRebateItemRender#0.1.9.0.0.i0.0.2.1",
      "path": "HometownRebateViewSkin.group._scrollSign._grpAccrueList._listAccrue.item0._grpNormal._grpLine1._imgLine1",
      "tag": "e:Image",
      "srcFile": "resource/skins/homeTown/HometownRebateItemRender.exml",
      "bounds": { "x": 0, "y": 0, "width": 67, "height": 11 },
      "source": "htSub_json.htrebate_ImgJindu2_png",
      "scale9Grid": "11,3,10,4"
    },
    {
      "listItemIndex": 1,
      "stableKey": "HometownRebateItemRender#0.1.9.0.0.i1.0.2.1",
      "stableKeyAliasInToolOutput": "HometownRebateItemRender#0.1.9.0.0.i1.0.2.1",
      "path": "HometownRebateViewSkin.group._scrollSign._grpAccrueList._listAccrue.item1._grpNormal._grpLine1._imgLine1",
      "tag": "e:Image",
      "srcFile": "resource/skins/homeTown/HometownRebateItemRender.exml",
      "bounds": { "x": 0, "y": 0, "width": 67, "height": 11 },
      "source": "htSub_json.htrebate_ImgJindu2_png",
      "scale9Grid": "11,3,10,4"
    },
    {
      "listItemIndex": 2,
      "stableKey": "HometownRebateItemRender#0.1.9.0.0.i2.0.2.1",
      "stableKeyAliasInToolOutput": "HometownRebateItemRender#0.1.9.0.0.i2.0.2.1",
      "path": "HometownRebateViewSkin.group._scrollSign._grpAccrueList._listAccrue.item2._grpNormal._grpLine1._imgLine1",
      "tag": "e:Image",
      "srcFile": "resource/skins/homeTown/HometownRebateItemRender.exml",
      "bounds": { "x": 0, "y": 0, "width": 67, "height": 11 },
      "source": "htSub_json.htrebate_ImgJindu2_png",
      "scale9Grid": "11,3,10,4"
    }
  ],
  "whyMultiple": "HometownRebateView.exml 中的 _listAccrue 是 eui.List（itemRendererSkinName=HometownRebateItemRenderSkin，布局 eui.HorizontalLayout）。eui.List 是运行时数据驱动组件，渲染器不支持其运行时行为，静态场景按占位容器处理并固定模拟 3 个 item（诊断 SCENE_LIST_STATIC_ITEMS：\"List 静态模拟 3 个 item: HometownRebateItemRenderSkin\"；unsupported：\"List 运行时数据驱动，静态模拟 3 个 item\"）。每个模拟 item（节点 tag=List:itemRenderer，index=0/1/2，simulated=true）完整实例化一份 HometownRebateItemRenderSkin，而该皮肤的 _grpNormal._grpLine1 下声明有 _imgLine1，于是 _imgLine1 随皮肤一起被实例化 3 次。EUI 中 id 按皮肤实例作用域解析（每个列表项各持一份皮肤副本），同一 id 在多个 item 实例中重复出现是 itemRenderer 机制的正常结果，并不是 EXML 里的重复声明。",
  "directlyDeclaredInHometownRebateViewExml": false,
  "directDeclarationExplanation": "三个 _imgLine1 节点的 srcFile 均为 resource/skins/homeTown/HometownRebateItemRender.exml，即它们来自 itemRenderer 皮肤 HometownRebateItemRenderSkin 的展开实例，不是 HometownRebateView.exml 的直接声明。HometownRebateView.exml 只通过 _listAccrue 的 itemRendererSkinName 属性引用该皮肤；视图自身树里与进度线相关的直接声明只有 _grpLine0 下的 _imgLinebg0 与 _imgLine0。",
  "actualDeclarationSite": {
    "file": "resource/skins/homeTown/HometownRebateItemRender.exml",
    "skinClass": "HometownRebateItemRenderSkin",
    "pathInSkin": "HometownRebateItemRenderSkin._grpNormal._grpLine1._imgLine1",
    "declarationCountInSkinFile": 1
  },
  "evidence": [
    "get_exml_scene(skins/homeTown/HometownRebateView.exml)：_listAccrue（eui.List）childCount=3，子节点为 item0/item1/item2（tag=List:itemRenderer，className=HometownRebateItemRenderSkin），unsupported 含 \"List 运行时数据驱动，静态模拟 3 个 item（itemRenderer=HometownRebateItemRenderSkin，布局 eui.HorizontalLayout 已应用）\"",
    "get_node_detail 逐一验证：三个 _imgLine1 的 path 分别为 ..._listAccrue.item0/item1/item2._grpNormal._grpLine1._imgLine1，srcFile 均为 resource/skins/homeTown/HometownRebateItemRender.exml，属性一致（eui.Image，source=htSub_json.htrebate_ImgJindu2_png，scale9Grid=11,3,10,4，67x11，visible=true）",
    "get_exml_scene(skins/homeTown/HometownRebateItemRender.exml)：item 皮肤自身节点树中 _imgLine1 仅声明一次（HometownRebateItemRenderSkin._grpNormal._grpLine1._imgLine1，key=HometownRebateItemRender#0），皮肤内其余节点无同 id",
    "HometownRebateView.exml 自身声明节点已完整枚举核对（共 25 个声明节点；根 group 的子节点索引 0-14 逐一查询确认，索引 15 查询返回 \"未找到 stableKey 对应的节点\"），其中不存在 id=_imgLine1 的直接声明",
    "交叉印证：场景诊断中 item 皮肤内的 _aniPanel/_aniCircle/_aniBtn/_aniTarget 各重复出现 3 次（每个模拟 item 一份），与 3 个 item 实例的结构一致；工程内 eui.List 仅此一处，ArtNumberSkin 经 skinName 指派但按 bitmapnumber 模拟渲染（childCount=0，不展开子节点），无其他 _imgLine1 来源"
  ],
  "unknowns": [
    "stableKey 的遮蔽前原始字符串无法直接读出：工具输出中节点 key 字段呈现为 {{SECRET_xxx}} 形式的别名（同一节点跨调用别名一致，三个 _imgLine1 分别为 HometownRebateItemRender#0.1.9.0.0.i0.0.2.1 / HometownRebateItemRender#0.1.9.0.0.i1.0.2.1 / HometownRebateItemRender#0.1.9.0.0.i2.0.2.1）；路径形态键（HometownRebateItemRender#0.1.9.0.0.i{n}.0.2.1）经 get_node_detail 精确匹配验证可解析到对应节点（构造的错误键 HometownRebateItemRender#9.9.9.9.9.i9.9.9.9 与超界键 HometownRebateView#0.1.15 均返回 \"未找到\"，证明为精确匹配而非模糊匹配），但无法确认哪一种形式是遮蔽前的规范 stableKey 原文，故两种标识均已列出",
    "运行时 _listAccrue 的真实条目数与各 item 的实际数据未知：\"3 个 item\" 是渲染器对 List 的静态模拟数量（SCENE_LIST_STATIC_ITEMS），固定为 3，不代表游戏运行时的实际列表长度",
    "三个 _imgLine1 的 bounds（x:0, y:0, 67x11）为节点在其父容器 _grpLine1 内的局部坐标；item1/item2 因 eui.HorizontalLayout 在舞台上的绝对位置未从返回数据中逐项取得（场景 JSON 传输被截断），未推算"
  ]
}