# Codex 网络代理撤回手册

本文记录从“强制 Codex App 走 Clash 代理”恢复到默认网络路径的操作。适用于此前为排查
`stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)`
而执行过 `launchctl setenv ... 127.0.0.1:7897` 的本机环境。

## 背景

当直连 ChatGPT/Codex 的 DNS 或长连接路径不稳定时，可以临时把 Codex App 固定到 Clash：

```bash
launchctl setenv HTTPS_PROXY http://127.0.0.1:7897
launchctl setenv HTTP_PROXY http://127.0.0.1:7897
launchctl setenv ALL_PROXY http://127.0.0.1:7897
launchctl setenv NO_PROXY 'localhost,127.0.0.1,::1,.blacklake.tech'
```

该设置只影响当前 macOS 登录会话中后续启动的 GUI 进程。网络恢复后应撤回，避免 Codex 继续依赖 Clash。

## 撤回步骤

1. 清空 launchd 环境变量：

```bash
launchctl unsetenv HTTPS_PROXY
launchctl unsetenv HTTP_PROXY
launchctl unsetenv ALL_PROXY
launchctl unsetenv NO_PROXY
```

如果命令返回 `Not privileged to set domain environment.`，需要在有权限的终端环境中重新执行。

2. 验证 launchd 环境已经清空：

```bash
launchctl getenv HTTPS_PROXY
launchctl getenv HTTP_PROXY
launchctl getenv ALL_PROXY
launchctl getenv NO_PROXY
```

预期四条命令都没有输出。

3. 检查小写变量，避免旧脚本写入了小写代理：

```bash
launchctl getenv https_proxy
launchctl getenv http_proxy
launchctl getenv all_proxy
launchctl getenv no_proxy
```

预期同样没有输出。

4. 检查 shell 启动文件没有持久化代理：

```bash
rg -n 'HTTPS_PROXY|HTTP_PROXY|ALL_PROXY|NO_PROXY|127\.0\.0\.1:7897' \
  ~/.zshrc ~/.zprofile ~/.profile ~/.bash_profile ~/.bashrc ~/.config 2>/dev/null
```

若存在相关 `export` 或 `launchctl setenv`，删除后重新打开终端。

5. 完全退出并重新打开 Codex App。

已经运行的 Codex 主进程和 `codex app-server` 不会因为 `launchctl unsetenv` 自动更新环境变量，必须重启 App。

6. 可选：确认新 Codex 进程未继承代理：

```bash
ps -axo pid,lstart,command | \
  rg '/Applications/Codex.app/Contents/(MacOS/Codex|Resources/codex app-server)'
```

拿到 PID 后检查：

```bash
ps eww -p <PID> | tr ' ' '\n' | \
  rg '^(HTTPS_PROXY|HTTP_PROXY|ALL_PROXY|NO_PROXY|https_proxy|http_proxy|all_proxy|no_proxy)='
```

预期没有输出。

## 网络验证

直接访问 Codex 后端接口：

```bash
curl -sS -o /dev/null \
  -w 'direct %{http_code} %{remote_ip} %{http_version} %{time_total}\n' \
  --connect-timeout 10 --max-time 20 \
  https://chatgpt.com/backend-api/codex/responses
```

返回 `405` 是正常的，因为这是 GET 请求访问只接受 Codex 请求的接口。重点看是否能解析、连接以及耗时是否稳定。

如果还要对比 Clash 路径：

```bash
curl -x http://127.0.0.1:7897 -sS -o /dev/null \
  -w 'proxy %{http_code} %{remote_ip} %{http_version} %{time_total}\n' \
  --connect-timeout 10 --max-time 20 \
  https://chatgpt.com/backend-api/codex/responses
```

## 当前建议

- 网络恢复后，不要给 Codex App 固定 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY`。
- Clash 和飞连可以保持安装或后台运行，但不要让二者同时接管同一类流量。
- 如需同时使用飞连和 Clash，推荐飞连使用 Split 模式，Clash 使用系统代理和 Rule 模式，Clash TUN 保持关闭。
- 若再次出现 Codex 断流，先用上述 `curl` 命令确认直连路径是否稳定，再决定是否临时恢复 `launchctl setenv`。
