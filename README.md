# Zelda-Shanzhai-webgame

《塞尔达传说：旷野之息》网页同人版 —— 基于 Three.js 的单文件网页游戏，纯前端、无外部依赖、完全离线可跑。

![zelda](https://img.shields.io/badge/Three.js-inline-blue) ![size](https://img.shields.io/badge/index.html-~1MB-orange)

## 玩法

双击打开 `index.html` 即可（推荐 Chrome / Edge 桌面版）。包含：开放地形探索、攀爬 / 游泳 / 滑翔、三段连击战斗与盾反、弓箭、符文系统、昼夜与天气、篝火烹饪等。

## 操作

| 动作 | 按键 |
|---|---|
| 移动 | W A S D |
| 冲刺 | Shift（消耗体力） |
| 蹲伏 | Ctrl / C |
| 跳跃 / 滑翔 | 空格（空中再按展开滑翔伞） |
| 攻击 | 鼠标左键（三段连击） |
| 举盾 / 盾反 | 鼠标右键（举盾瞬间为盾反） |
| 弓箭 | 按住 F 瞄准，左键射击 |
| 符文 | Q 使用 · R 切换 · Tab 轮盘 · 1~4 切换装备 |
| 攀爬 | 面向崖壁前行即可（雨天打滑） |
| 交互 | E |
| 地图 | M |

## 项目结构

```
botw3/
├── index.html      # 构建产物：单文件成品（three.js 已内联，~1MB）
├── build.sh        # 构建脚本：把 parts/ 拼接成 index.html
└── parts/          # 模块化源码
    ├── 00_head.html    # HTML 头 + CSS
    ├── three.min.js    # Three.js（内联）
    ├── 10_util.js      # 工具函数
    ├── 20_textures.js  # 程序化贴图
    ├── 30_sky.js       # 天空 / 昼夜
    ├── 40_terrain.js   # 地形
    ├── 45_water.js     # 水面
    ├── 50_flora.js     # 植被
    ├── 55_props.js     # 道具
    ├── 60_character.js # 角色与动画
    ├── 65_enemies.js   # 敌人 AI
    ├── 70_gameplay.js  # 战斗 / 交互逻辑
    ├── 80_audio.js     # 音频
    ├── 85_post.js      # 后期特效
    ├── 90_ui.js        # UI / HUD
    ├── 99_main.js      # 主循环 / 输入
    └── zz_tail.html    # HTML 尾部
```

## 构建

改完 `parts/` 里的源码后重新生成 `index.html`：

```bash
bash build.sh
```

## 说明

- 本项目为学习性质的同人作品，塞尔达传说相关权利归 Nintendo 所有。
- 由 Claude Code（DeepSeek-V4-Flash）协作开发。
