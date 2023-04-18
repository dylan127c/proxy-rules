﻿module.exports.parse = async (raw, { axios, yaml, notify, console }, { name, url, interval, selected }) => {
  const obj = yaml.parse(raw);

  const fs = require("fs");
  const path = require("path");

  // 读取当前目录下的settings.yaml配置文件
  const rawSettings = fs.readFileSync(path.resolve(__dirname, "settings.yaml"), "utf8");
  const objSettings = yaml.parse(rawSettings);

  const disableHttp = objSettings["disableHttp"]; // 是否启用http方式获取规则列表
  const disableStashOutput = objSettings["disableStashOutput"]; // 是否转换并导出stash配置文件
  const disableClashVergeOutput = objSettings["disableClashVergeOutput"]; // 是否将配置同步到clash-verge中

  // 替换订阅中的DNS配置，但无法确定是订阅中的DNS生效，还是Clash默认TUN Mode内的DNS生效
  // 以防万一，可以将TUN Mode中的DNS配置修改为与自定义DNS配置一致，但不改也能用
  // 使用TUN模式请关闭浏览器中的安全DNS功能，以防止DNS劫持失败
  obj["dns"] = objSettings["dns"];

  /* ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓ 允许修改或添加配置 ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓ */

  // 规则可以让指定的程序或规则列表（Rule Providers）使用特定的模式
  // 这里的模式一般只包含三种：指定的Proxy Group名称或DIRECT、REJECT
  obj["rules"] = [
    "PROCESS-NAME,aria2c.exe,DIRECT",
    "PROCESS-NAME,Motrix.exe,DIRECT",
    "PROCESS-NAME,BitComet.exe,DIRECT",

    "RULE-SET,Customize-Reject,REJECT",
    "RULE-SET,Customize-Special,特殊控制", // for ChatGPT
    "RULE-SET,Customize-Direct,DIRECT",
    "RULE-SET,Customize-Proxy,科学上网",

    "RULE-SET,Remote-Applications,DIRECT",
    "RULE-SET,Remote-Apple,DIRECT",
    "RULE-SET,Remote-iCloud,DIRECT",
    "RULE-SET,Remote-Reject,REJECT",
    "RULE-SET,Remote-Proxy,科学上网",
    "RULE-SET,Remote-GFW,科学上网",
    "RULE-SET,Remote-Direct,DIRECT",
    "RULE-SET,Remote-Private,DIRECT",
    "RULE-SET,Remote-Greatfire,科学上网",
    "RULE-SET,Remote-Tld-not-cn,科学上网",

    /**
     * IP规则同时适用于黑、白名单模式。
     * 
     * 黑名单模式下，IP规则不解析国外域名，以避免DNS欺骗/污染或DNS泄露。
     * 但代价是需要维护一个自定义的域名列表，用于匹配代理解锁限制。
     * 
     * 白名单模式下，本规则可最大程度保证无国内风险，但DNS欺骗/污染或DNS泄露不可避免。
     * 如果确认无访问国内域名或IP地址，推荐选用全局模式，以避免DNS欺骗/污染或DNS泄露。
     */
    "RULE-SET,Remote-Telegramcidr,科学上网,no-resolve",
    "RULE-SET,Remote-Cncidr,DIRECT",
    "RULE-SET,Remote-Lancidr,DIRECT",
    "GEOIP,LAN,DIRECT",
    "GEOIP,CN,DIRECT",

    "MATCH,规则逃逸"
  ];

  // Determine the current subscription link.
  const isEasternNetwork = JSON.stringify(url).match(/touhou/gm);
  const isColaCloud = JSON.stringify(url).match(/dingyuedizhi/gm);

  let prefix = ""; // 组别前缀
  let outputName = ";" // Stash配置的输出文件名及.stoverride文件的别名

  const proxyGroups = [];
  if (isEasternNetwork) {
    prefix = "🛤️";
    outputName = "ORIENTAL_NETWORK";

    proxyGroups[0] = getProxyGroup("科学上网", "select", ["DIRECT", "目标节点", "故障切换", "香港自动", "日本自动"]);
    proxyGroups[1] = getProxyGroup("规则逃逸", "select", ["DIRECT", "科学上网"]);
    proxyGroups[2] = getProxyGroup("特殊控制", "select", ["REJECT", "目标节点", "故障切换", "香港自动", "日本自动"]);
    proxyGroups[3] = getProxyGroup("目标节点", "select", ["REJECT"], /.+/gm);

    proxyGroups[4] = getProxyGroup("香港自动", "url-test", [], /香港\s\d\d ((?!流媒体).)*$/gm);
    proxyGroups[5] = getProxyGroup("日本自动", "url-test", [], /日本\s\d\d/gm)

    proxyGroups[6] = getProxyGroup("故障切换", "fallback", [], /专线/gm);
    proxyGroups[6].proxies.sort((a, b) => {
      const sortRules = ["移动/深港", "电信/深港", "电信/沪日"];
      const target = /.{2}\/.{2}/gm;
      return sortRules.indexOf(a.match(target).pop()) - sortRules.indexOf(b.match(target).pop());
    });
  } else if (isColaCloud) {
    prefix = "🛣️";
    outputName = "COLA_CLOUD";

    proxyGroups[0] = getProxyGroup("科学上网", "select", ["DIRECT", "目标节点", "故障切换", "香港自动", "香港海外"]);
    proxyGroups[1] = getProxyGroup("规则逃逸", "select", ["DIRECT", "科学上网"]);
    proxyGroups[2] = getProxyGroup("特殊控制", "select", ["REJECT", "目标节点", "故障切换", "香港自动", "香港海外"]);
    proxyGroups[3] = getProxyGroup("目标节点", "select", ["REJECT"], /^((?!套餐).)*$/gm);

    proxyGroups[4] = getProxyGroup("香港自动", "url-test", [], /香港\s\d\d/gm);
    proxyGroups[5] = getProxyGroup("香港海外", "url-test", [], /香港\d\d\s海外用節點/gm);

    proxyGroups[6] = getProxyGroup("故障切换", "fallback", [], /(越南|獅城|台灣)\s\d\d/gm);
    proxyGroups[6].proxies.sort((a, b) => {
      const sortRules = ["台灣", "獅城", "越南"];
      const target = /^.{2}/gm;
      return sortRules.indexOf(a.match(target).pop()) - sortRules.indexOf(b.match(target).pop());
    });

    // 对于允许下载行为的代理，可以从规则中剔除对指定.exe程序的限制
    obj["rules"].shift(); // 剔除对aria2c.exe的限制
    obj["rules"].shift(); // 剔除对Motrix.exe的限制
    obj["rules"].shift(); // 剔除对BitComet.exe的限制
  }
  obj["proxy-groups"] = proxyGroups;

  /* ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑ 允许修改或添加配置 ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑ */

  /**
   * 用于创建节点组。
   * 
   * @param {string} groupName 组名
   * @param {string} groupType 类型
   * @param {Array} stableGroup 属于该分组的节点或组别 
   * @param {RegExp} regex 正则表达式，用于筛选节点
   * @returns 
   */
  function getProxyGroup(groupName, groupType, stableGroup, regex) {
    const proxyGroup = {
      name: groupName,
      type: groupType,
      url: "http://www.gstatic.com/generate_204",
      interval: 600,
      proxies: []
    };

    if (stableGroup.length != 0) {
      proxyGroup.proxies = stableGroup;
    }

    if (regex !== undefined) {
      const transfer = (regex + "").substring(1, (regex + "").length - 3);
      regex = new RegExp("(?:" + transfer + ")");

      obj.proxies.forEach(ele => {
        var proxyName = ele.name;
        if (proxyName.match(regex)) {
          proxyGroup.proxies.push(proxyName);
        }
      });
    }
    return proxyGroup;
  }

  // 构建Rule providers对象
  const httpClassical = { type: "http", behavior: "classical", interval: 86400 };
  const httpDomain = { type: "http", behavior: "domain", interval: 86400 };
  const httpIpcidr = { type: "http", behavior: "ipcidr", interval: 86400 };

  const fileClassical = { type: "file", behavior: "classical", };
  const fileDomain = { type: "file", behavior: "domain", };
  const fileIpcidr = { type: "file", behavior: "ipcidr", };

  // 远程非自定义的规则文件 => https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/
  // 另一个获取规则文件地址 => https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/
  const rpRemoteHttp = {
    "Remote-Reject": { ...httpDomain }, // 针对不可变对象，使用shallow copy即可
    "Remote-Proxy": { ...httpDomain },
    "Remote-Direct": { ...httpDomain },
    "Remote-Private": { ...httpDomain },
    "Remote-GFW": { ...httpDomain },
    "Remote-Greatfire": { ...httpDomain },
    "Remote-Tld-not-cn": { ...httpDomain },
    "Remote-Telegramcidr": { ...httpIpcidr },
    "Remote-Cncidr": { ...httpIpcidr },
    "Remote-Lancidr": { ...httpIpcidr },
    "Remote-Applications": { ...httpClassical },
    "Remote-iCloud": { ...httpDomain },
    "Remote-Apple": { ...httpDomain },
  };

  // 远程自定义的规则文件 => https://raw.githubusercontent.com/dylan127c/proxy-rules/main/clash/customize%20rules/
  const rpCustomizeHttp = {
    "Customize-Special": { ...httpDomain },
    "Customize-Direct": { ...httpDomain },
    "Customize-Reject": { ...httpDomain },
    "Customize-Proxy": { ...httpDomain }
  };

  // 本地非自定义的规则文件 => path.resolve(__dirname, "remote rules")
  const rpRemoteFile = {
    "Remote-Reject": { ...fileDomain },
    "Remote-Proxy": { ...fileDomain },
    "Remote-Direct": { ...fileDomain },
    "Remote-Private": { ...fileDomain },
    "Remote-GFW": { ...fileDomain },
    "Remote-Greatfire": { ...fileDomain },
    "Remote-Tld-not-cn": { ...fileDomain },
    "Remote-Telegramcidr": { ...fileIpcidr },
    "Remote-Cncidr": { ...fileIpcidr },
    "Remote-Lancidr": { ...fileIpcidr },
    "Remote-Applications": { ...fileClassical },
    "Remote-iCloud": { ...fileDomain },
    "Remote-Apple": { ...fileDomain },
  };

  // 本地自定义的规则文件 => path.resolve(__dirname, "customize rules")
  const rpCustomizeFile = {
    "Customize-Special": { ...fileDomain },
    "Customize-Direct": { ...fileDomain },
    "Customize-Reject": { ...fileDomain },
    "Customize-Proxy": { ...fileDomain }
  };

  // Setup url or path for rule providers.
  const httpRemote = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/";
  const httpCustomize = "https://raw.githubusercontent.com/dylan127c/proxy-rules/main/clash/customize%20rules/";
  const fileRemote = path.resolve(__dirname, "remote rules");
  const fileCustomize = path.resolve(__dirname, "customize rules");

  for (const [key, value] of Object.entries(rpRemoteHttp)) {
    rpRemoteHttp[key]["url"] = httpRemote + getFileName(key, "txt");
  }
  for (const [key, value] of Object.entries(rpCustomizeHttp)) {
    rpCustomizeHttp[key]["url"] = httpCustomize + getFileName(key, "yaml");
  }
  for (const [key, value] of Object.entries(rpRemoteFile)) {
    rpRemoteFile[key]["path"] = path.resolve(fileRemote, getFileName(key, "yaml"));
  }
  for (const [key, value] of Object.entries(rpCustomizeFile)) {
    rpCustomizeFile[key]["path"] = path.resolve(fileCustomize, getFileName(key, "yaml"));
  }

  // 深拷贝要使用JSON.stringify()和JSON.parse()方法
  const rpRemoteHttpRaw = JSON.stringify(rpRemoteHttp);
  const rpRemoteFileRaw = JSON.stringify(rpRemoteFile);
  const rpCustomizeHttpRaw = JSON.stringify(rpCustomizeHttp);
  const rpCustomizeFileRaw = JSON.stringify(rpCustomizeFile);

  // 根据配置文件选择使用远程的Rule Providers，还是本地的Rule Providers
  // 但该配置仅针对非自定义的规则，自定义规则只推荐使用本地的Rule Providers
  if (disableHttp) {
    obj["rule-providers"] = Object.assign(
      JSON.parse(rpRemoteFileRaw), JSON.parse(rpCustomizeFileRaw)
    );
  } else {
    obj["rule-providers"] = Object.assign(
      JSON.parse(rpRemoteHttpRaw), JSON.parse(rpCustomizeFileRaw)
    );
  }

  // 由于Rules规则中也存在组名，单纯为组别添加前缀不可行，需要全局替换
  const groupNames = [];
  proxyGroups.forEach(proxyGroup => {
    groupNames.push(proxyGroup.name);
  })
  /**
   * 用于遍历当前已存在的所有组名数组，以添加组别的前缀信息
   * 
   * @param {string} str 订阅配置的string类型原文
   * @param {string} prefix 前缀信息
   * @returns 
   */
  function addPrefix(str, prefix) {
    for (var i = 0; i < groupNames.length; i++) {
      str = str.replaceAll(groupNames[i], prefix + " " + groupNames[i]);
    }
    return str;
  }

  /**
   * 用于输出Stash配置文件。
   * 
   * @param {string} outputName 输出文件名及.stoverride文件的别名
   * @param {string} prefix 为组名添加的前缀信息
   */
  function outputStashConfig(outputName, prefix) {
    const output = {
      name: outputName,
      desc: "Replace original config.",
      "proxy-groups": obj["proxy-groups"],
      rules: obj.rules,
      "rule-providers": Object.assign(
        JSON.parse(rpRemoteHttpRaw), JSON.parse(rpCustomizeHttpRaw)
      )
    };
    const str = yaml.stringify(output);
    let finalOutput = str.replace("rules:", "rules: #!replace")
      .replace("proxy-groups:", "proxy-groups: #!replace")
      .replace("rule-providers:", "rule-providers: #!replace");

    fs.writeFile(
      path.resolve(__dirname, "..", "stash", outputName + ".stoverride"),
      addPrefix(finalOutput, prefix),
      (err) => { throw err; }
    );
  }

  /**
   * 用于同步Clash Verge配置文件。
   * 
   * @returns 退出函数
   */
  function syncClashVergeConfig() {
    const currentSubscription = JSON.stringify(url);
    const configPath = objSettings["configPathForClashVerge"];

    const configNames = objSettings["configNameForClashVerge"];
    const regexMatchers = objSettings["configRegexMatcher"];

    if (configNames.length !== regexMatchers.length || configNames.length === 0) {
      return;
    }

    for (var i = 0; i < configNames.length; i++) {
      if (currentSubscription.match(regexMatchers[i])) {
        fs.writeFile(
          path.resolve(configPath, configNames[i] + ".yaml"),
          addPrefix(yaml.stringify(obj), prefix),
          (err) => { throw err; }
        );
        return;
      }
    }
  }

  if (!disableStashOutput) {
    outputStashConfig(outputName, prefix);
  }

  if (!disableClashVergeOutput) {
    syncClashVergeConfig();
  }

  return addPrefix(yaml.stringify(obj), prefix);
}

/**
 * 用于提取并拼接目标规则文件的名称。
 * 
 * @param {string} key 
 * @param {string} type 
 * @returns 
 */
function getFileName(key, type) {
  return key.match(/-[-\w]+/gm).pop().replace(/^-/gm, "").toLowerCase() + "." + type;
}