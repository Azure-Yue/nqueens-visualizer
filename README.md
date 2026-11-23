# N-QUEENS LAB

N 皇后问题交互式可视化页面。纯 HTML / CSS / JavaScript，无后端、无依赖、可离线运行。

## 功能

- 8 皇后默认演示，支持 4～10 皇后。
- 回溯法：单步、暂停、调速、剪枝高亮、攻击线、实时统计、解画廊。
- 最小冲突局部搜索：固定随机种子、冲突连线、候选列打分、冲突曲线、重启演示。
- 8 皇后可完整枚举 92 个解，点击缩略图可回看。
- 响应式布局，桌面、平板、手机均可使用。

## 目录结构

    nqueens-visualizer/
    ├── docs/
    │   ├── index.html      页面结构
    │   ├── styles.css      页面样式
    │   ├── solver.js       回溯法 / 最小冲突事件生成器
    │   ├── app.js          页面交互与渲染
    │   └── .nojekyll       让 GitHub Pages 按静态文件发布
    ├── .gitignore
    └── README.md

## 本地运行

最简单的方式：直接双击 docs/index.html。

如果浏览器限制了本地文件脚本，进入 docs 启一个静态服务器：

    cd docs
    python -m http.server 8000

浏览器打开：

    http://localhost:8000

## 操作说明

- **开始 / 暂停**：自动播放；再次点击暂停。
- **单步**：一次只消费一个算法事件。
- **重置**：清空棋盘、统计和解画廊。
- **速度**：从“慢速”到“极速”；回溯法在极速下会批量推进事件。
- **目标**：回溯法可选“第一个解”或“全部解”。
- **随机种子**：局部搜索专用；固定种子可以复现同一段演示。
- 快捷键：空格播放 / 暂停，→ 单步，R 重置。

## 8 皇后基准

| 指标 | 数值 |
|---|---:|
| 解的总数 | 92 |
| 回溯法有效结点 | 2,056 |
| 尝试落子次数 | 15,720 |
| 回溯次数 | 2,056 |
| 旋转 / 镜像后本质不同 | 12 |

局部搜索的步数取决于随机种子，页面会实时显示。

## 发布到 GitHub Pages

### 方式一：GitHub Desktop（推荐）

1. 安装并登录 GitHub Desktop。
2. 选择 File → Add local repository。
3. 选择本目录：

       D:\deepseek work\Day_work\算法设计\nqueens-visualizer

4. 如果提示“不是 Git 仓库”，点击 create a repository。
5. 左下角填写提交信息，例如：

       feat: N 皇后可视化页面

6. 点击 Commit to main。
7. 点击右上角 Publish repository。
8. 仓库名填 nqueens-visualizer，建议选择 **Public**。
9. 发布后打开 GitHub 仓库网页：

       Settings → Pages

10. 设置：

        Source: Deploy from a branch
        Branch: main
        Folder: /docs

11. 保存后等待 1～2 分钟，访问：

        https://你的用户名.github.io/nqueens-visualizer/

### 方式二：命令行

先在 GitHub 上创建一个空仓库，然后在本目录执行：

    git init
    git add .
    git commit -m "feat: N 皇后可视化页面"
    git branch -M main
    git remote add origin https://github.com/你的用户名/nqueens-visualizer.git
    git push -u origin main

之后同样在 Settings → Pages 选择 main + /docs。

## 更新页面

修改 docs 里的文件后：

    GitHub Desktop → Changes → Commit to main → Push origin

GitHub Pages 会自动重新发布，通常 1～2 分钟生效。浏览器没变化时按 Ctrl + F5。

## 常见问题

### 页面 404

检查：

- docs/index.html 是否存在；
- Pages 的 Folder 是否选了 /docs；
- 分支是否是 main。

### 页面没有样式或脚本

检查 index.html 中使用的是相对路径：

    <link rel="stylesheet" href="./styles.css">
    <script src="./solver.js"></script>
    <script src="./app.js"></script>

不要写成 /styles.css，否则项目页会从域名根目录找文件。

### GitHub 提示 LF / CRLF 行尾警告怎么办？

这是行尾格式提示，不会阻止发布。项目已经用 .gitattributes 统一为 LF：

    * text=auto eol=lf

如果仓库里已经提交过旧文件，执行一次重新规范化：

    git add --renormalize .
    git commit -m "chore: normalize line endings"
    git push

### 能不能直接跑 Python 或 C#？

不能。GitHub Pages 只托管静态文件，浏览器里运行的是 JavaScript 版本。

### 局部搜索为什么每次不一样？

它使用随机初始状态。固定“随机种子”即可复现同一段过程。

## 技术说明

- 无第三方库、无 CDN、无网络请求；
- 算法逻辑在 docs/solver.js；
- 两个算法都是事件生成器，因此页面可以单步、暂停、调速，而不是算完才显示结果；
- 所有资源使用相对路径，可直接部署到 GitHub Pages 子路径。
