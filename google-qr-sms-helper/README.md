# Google QR 自动降级短信助手 (Quantumult X 版)

基于 [havenicec/google-qr-sms-helper](https://github.com/havenicec/google-qr-sms-helper) 移植的纯 Quantumult X 脚本，无需搭配油猴脚本。

## 功能说明
- `google-qr-req-header.js`：将 `accounts.google.com` 请求头统一伪装为 `iPad Mini`（`/devicephoneverification/` 路径伪装为 `iPhone`）并移除 `Sec-CH-UA*` 请求头。
- `google-qr-resp-header.js`：移除 HTML 页面的 `Content-Security-Policy` 响应头，允许注入页面脚本。
- `google-qr-inject.js`：在 `accounts.google.com` 注入 `navigator` 伪装，并在 Cloud Console 与二维码验证页挂载操作面板（iOS Safari 下自动回退至 HTML 提取 / `jsQR` 解码，并支持手动粘贴链接兜底）。
- `google-qr-downgrade.js`：通过 `script-analyze-echo-response` 拦截同源虚拟接口并由 `$task.fetch` 完成 `MypxBd` / `consent` / `YDtwf` 请求，注入 `[3,null,4]` 降级状态。

## Quantumult X 安装步骤
1. 确保 Quantumult X 已开启 **MitM** 并信任根证书，且 `hostname` 中包含 `accounts.google.com, console.cloud.google.com`（通过下方远程重写导入会自动带入）。
2. 在 Quantumult X 配置文件的 `[rewrite_remote]` 中添加（或在 UI「重写 -> 引用」中添加）：
   ```ini
   https://raw.githubusercontent.com/Wu2200/quanx/main/google-qr-sms-helper/google-qr-sms-helper.snippet, tag=Google QR 降级短信助手, enabled=true
   ```
3. 在 Safari 打开 `https://console.cloud.google.com/`（如未看到右上角终端图标 `[>_]`，请在地址栏菜单切换为**请求桌面网站**），点击终端图标唤出 `Verify` 弹窗并进入二维码验证页，随后点击右下角悬浮面板中的「一键降级到短信选择框」。
