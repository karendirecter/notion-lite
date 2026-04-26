# Notion Lite

一个简洁优雅的笔记应用，支持中英文切换、表格、图片等功能。

## 功能特性

- ✅ **中英文双字体模式**
- ✅ **表格支持**：拖拽选择，批量删除，行列插入
- ✅ **图片支持**：缩放，拖拽移动
- ✅ **多种块类型**：段落、标题、待办、引用、代码等
- ✅ **明暗主题**
- ✅ **本地存储**：数据自动保存

## 部署到 GitHub Pages

### 1. 在 GitHub 创建仓库

1. 访问 [github.com/new](https://github.com/new)
2. 仓库名称建议：`notion-lite`（或其他你喜欢的名字）
3. 选择 **Public** 或 **Private**
4. **不要**勾选 "Initialize this repository with a README"
5. 点击 **Create repository**

### 2. 推送代码

在项目目录下执行：

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

（注意替换 `你的用户名` 和 `你的仓库名`）

### 3. 开启 GitHub Pages

1. 进入你的 GitHub 仓库页面
2. 点击右上角 **Settings**
3. 左侧菜单找到 **Pages**（在 "Code and automation" 部分）
4. 在 **Build and deployment** 部分：
   - **Source**：选择 `Deploy from a branch`
   - **Branch**：选择 `main` 分支，文件夹选择 `/ (root)`
   - 点击 **Save**
5. 等待 1-2 分钟，刷新页面，你会看到部署好的网址！

### 4. 访问你的应用

你的应用会部署在：
```
https://你的用户名.github.io/你的仓库名/
```

## 项目结构

```
notion/
├── index.html   # 主页面
├── styles.css   # 样式文件
├── app.js       # 逻辑文件
└── README.md    # 说明文档
```

## 开发说明

直接在本地用浏览器打开 `index.html` 即可预览效果！

## 许可证

MIT License
