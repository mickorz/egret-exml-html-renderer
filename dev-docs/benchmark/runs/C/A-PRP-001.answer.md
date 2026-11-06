{
  "node_id": "_imgCost",
  "file": "resource/skins/homeTown/HometownGiftView.exml",
  "tool_file_param": "skins/homeTown/HometownGiftView.exml",
  "className": "HometownGiftViewSkin",
  "path": "HometownGiftViewSkin.group._grpCost._imgCost",
  "stableKey": "HometownGiftView#0.1.6.0",
  "native_tag": "e:Image (eui.Image)",
  "native_attributes": {
    "id": "_imgCost",
    "visible": "true",
    "scale9Grid": "153,18,6,9",
    "source": "htSub_json.ImgShuliang_png",
    "horizontalCenter": "0",
    "verticalCenter": "0"
  },
  "position_related_native_attributes": {
    "horizontalCenter": "0",
    "verticalCenter": "0"
  },
  "declared_xy_or_edge_constraints": null,
  "bounds": {
    "x": -91.5,
    "y": -28,
    "width": 183,
    "height": 56,
    "coordinate_system": "父节点 _grpCost 的局部坐标系"
  },
  "parent_node": {
    "id": "_grpCost",
    "native_attributes": {
      "id": "_grpCost",
      "width": "0",
      "height": "0",
      "visible": "true"
    },
    "bounds": { "x": 0, "y": 0, "width": 0, "height": 0 },
    "note": "父容器自身未声明 x/y，无偏移"
  },
  "size_source": {
    "kind": "frame",
    "file": "resource/assets/module/homeTown/htSub.png",
    "frame": { "x": 1230, "y": 962, "w": 183, "h": 56 },
    "note": "EXML 未声明 width/height，尺寸来自纹理帧测量"
  },
  "difference_reason": "两者性质不同：native.attributes 里根本没有声明 x/y（也没有 left/top/right/bottom/width/height），位置完全由布局约束 horizontalCenter=0 与 verticalCenter=0 决定；bounds 是渲染器根据约束推导出的计算结果，不是被声明的数值。推导过程：父容器 _grpCost 是声明为 width=0、height=0 的 Group（自身也无位移），其中心即原点 (0,0)；_imgCost 的测量尺寸为 183×56（来自 htSub.png 中 ImgShuliang 帧 w=183 h=56）。horizontalCenter=0/verticalCenter=0 表示图片中心对齐父容器中心，于是左上角 = (0 - 183/2, 0 - 56/2) = (-91.5, -28)。负坐标是图片居中挂在一个 0×0 容器原点上的必然结果。同文件其他节点可交叉验证该算法（如 _btnClose：horizontalCenter=370，x=(1040-40)/2+370=870，与 bounds 一致）。",
  "field_to_change": "修改 <e:Image id=\"_imgCost\"> 标签上的 horizontalCenter（横向）与 verticalCenter（纵向）两个属性。取值含义是图片中心相对父容器中心的偏移量，例如 horizontalCenter=\"-10\" 表示整体向左移 10px。注意：在 EUI BasicLayout 中，horizontalCenter/verticalCenter 约束的优先级高于显式 x/y；若想改用 x/y 直接定位，必须先删除这两个约束属性，否则新增的 x/y 不会生效。另外若改的是父容器 _grpCost 的位置/尺寸，也会间接改变 _imgCost 的绝对位置（但 _grpCost 当前声明为 0×0 且无位移，疑似由运行时代码驱动）。",
  "unsupported": [],
  "unknowns": [
    "工具链没有按节点 id 做全工程检索的通道（search_ui_assets 只按文件/根类/组件类型过滤），无法穷举证明 _imgCost 全工程唯一；已检查的主要购买/消耗类皮肤（ShopItemSkin、FullShopItemSkin、FullExchangeItemSkin、PrayView、HometownGiftView、HometownRebateItemRender 等）中，精确匹配 _imgCost 的仅 HometownGiftView.exml 这一处。",
    "bounds 是渲染器静态计算值；HometownGiftView 含多个运行时驱动的组件（ArtNumberEUI 位图数字、DragonBonesAni 动画、_grpCost 声明为 0×0 疑似由代码移动/缩放），运行时代码若动态修改布局，实际显示位置可能与静态 bounds 不同，静态数据无法确认。"
  ]
}