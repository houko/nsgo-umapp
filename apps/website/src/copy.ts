// The page's words, in English and Simplified Chinese. Short, specific and
// calm; every claim should be something the app does. Chinese headings,
// titles and kickers omit the trailing 。; body sentences keep it.

import type { IconName } from './icons';
import { site, type Lang } from './site';
import type { Led, Tone } from './template';

type Feature = { led: Led; title: string; body: string };
type Card = { icon: IconName; kicker: string; title: string; body: string; link: string; href: string };
type Note = { led: Led; title: string; body: string };
type Column = { value: string; title: string; body: string };

const en = {
  meta: {
    title: 'Umapp — your Umami, in the menu bar',
    description:
      'Umapp is a native app for macOS, in the menu bar and a window, and for iPhone, that shows your websites and who is visiting them right now, from Umami or from its own server on Cloudflare. Free and open source.',
    ogAlt: 'Umapp — your Umami, in the menu bar',
  },

  nav: {
    skip: 'Skip to content',
    primary: 'Primary',
    home: 'Umapp home',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Window', href: '#window' },
      { label: 'A website', href: '#site' },
      { label: 'iPhone', href: '#iphone' },
      { label: 'Get started', href: '#start' },
    ],
    github: 'GitHub',
    cta: 'Download',
    menu: 'Open menu',
    close: 'Close menu',
    menuLabel: 'Menu',
  },

  theme: { label: 'Appearance', light: 'Light', dark: 'Dark', system: 'System' },
  language: { label: 'Language', en: 'English', zh: '中文' },
  code: { copy: 'Copy code', command: 'Copy command' },

  lightbox: {
    label: 'Screenshot',
    enlarge: 'Enlarge',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
  },

  hero: {
    badge: { tag: 'New', text: 'Umapp for macOS and iPhone' },
    title: 'Your Umami.\nIn the menu bar.',
    lede: 'Umapp shows every website of your Umami account, its visitors and views, and how many people are on it now — one click from the menu bar, or in a window when you want more room.',
    primary: 'Download Umapp',
    secondary: 'View on GitHub',
    fine: 'Free and open source · MIT · Updates itself',
    tone: 'green' as Tone,
    shots: {
      list: {
        alt: 'Umapp’s panel: visitors and views over 7 days, and five websites with their visitors online, sparklines and changes',
        caption: 'Every website, its visitors and who is on it now.',
      },
    },
  },

  names: {
    title: 'Works with',
    names: ['Umami Cloud', 'Self-hosted Umami', 'Umapp’s server'],
    note: 'Any server that answers as Umami does, with an API key, Umapp’s own on Cloudflare Workers among them',
  },

  features: {
    title: 'Analytics at a glance.',
    lead: 'Open the panel, see how your websites are doing, close it. Nothing more to set up than an API key, or one command for a server of your own.',
    items: [
      {
        led: 'green',
        title: 'Who is on now',
        body: 'Visitors online beside the menu bar icon, on every website, and on each of its tags, pages and countries. Hide the count if you would rather not see it.',
      },
      {
        led: 'blue',
        title: 'Every website, one list',
        body: 'Every website the key can see, each with its icon, domain and sparkline, sorted by visitors, views or name.',
      },
      {
        led: 'violet',
        title: 'Compared with before',
        body: 'Visitors and views over 24 hours, 7, 30 or 90 days, each next to the range before it.',
      },
      {
        led: 'amber',
        title: 'Umami, or no Umami at all',
        body: 'Connect to Umami Cloud or a server of your own, or deploy Umapp’s own server to Cloudflare with one command: it counts the websites of the same account with nothing to embed.',
      },
      {
        led: 'teal',
        title: 'Your websites, managed',
        body: 'Add, rename or delete a website, copy the tracking code it embeds, and see whether its visits arrive, from settings or its page.',
      },
      {
        led: 'pink',
        title: 'Native, and up to date',
        body: 'Opens at login if you like and refreshes on its own: visitors online every minute, the rest every five. Signed releases install in place, in English or Simplified Chinese.',
      },
    ] satisfies Feature[],
  },

  window: {
    title: 'A window when you want more room.',
    lead: 'Open Umapp in a window: the websites in a sidebar with who is on each, and a website’s page laid out wide, its pages, referrers and countries side by side. It shows in the Dock only while it is open.',
    alt: 'Umapp’s window: the websites in a sidebar beside NSGo’s page, with its metrics, a chart, and its pages, referrers and countries side by side',
    caption: 'The window: every website in the sidebar, one open beside it.',
    tone: 'amber' as Tone,
  },

  site: {
    title: 'Open a website for the details.',
    lead: 'Bounce rate, visit duration and a chart with the counts under the pointer, then the top pages, referrers and countries, for every event or one tag.',
    alt: 'One website in Umapp: its tags, six metrics and a chart of visitors and views by day',
    caption: 'NSGo’s website over 7 days, with its tags and their visitors online.',
    tone: 'blue' as Tone,
    notes: [
      { led: 'green', title: 'Tags', body: 'See one tag’s numbers, or all of them together.' },
      { led: 'blue', title: 'Chart', body: 'By hour or by day, counts under the pointer.' },
      { led: 'amber', title: 'Breakdowns', body: 'Pages, referrers with icons, countries with flags.' },
    ] satisfies Note[],
  },

  cards: {
    title: 'On your Mac. On your iPhone. On your server.',
    lead: 'The same app, made for each, and a server to count with if you would rather not run Umami.',
    items: [
      {
        icon: 'monitor',
        kicker: 'macOS',
        title: 'In the menu bar, and a window',
        body: 'A left click opens the panel; the right-click menu, ⌘0 or opening Umapp again opens the window. Install with one command or a disk image; Umapp keeps itself up to date.',
        link: 'Download',
        href: '#start',
      },
      {
        icon: 'phone',
        kicker: 'iPhone',
        title: 'The panel, full screen',
        body: 'The iPhone app opens straight to the panel and refreshes when it comes back. It builds from source with Go and Xcode.',
        link: 'Build it',
        href: '#iphone',
      },
      {
        icon: 'server',
        kicker: 'Cloudflare',
        title: 'Your own server',
        body: 'npm run deploy puts Umapp’s server on Cloudflare Workers, tracks the websites of the same account with nothing to embed, and opens Umapp on your Mac to connect.',
        link: 'Deploy it',
        href: site.server as string,
      },
    ] satisfies Card[],
  },

  iphone: {
    title: 'In your pocket, too.',
    lead: 'On iPhone the panel fills the screen: the same list, the same websites, the same numbers.',
    tone: 'violet' as Tone,
    shots: {
      list: {
        alt: 'Umapp on iPhone: the websites and their visitors',
        caption: 'The list on iPhone.',
      },
      site: {
        alt: 'One website on iPhone: tags, metrics and a chart',
        caption: 'A website on iPhone.',
      },
    },
    link: 'Build the iPhone app',
  },

  steps: {
    title: 'Three steps to your numbers.',
    lead: 'Start Umapp, give it a key, and the panel fills in.',
    items: [
      {
        value: '01',
        title: 'Start Umapp',
        body: 'It adds an icon to the menu bar. Click it to open the panel.',
      },
      {
        value: '02',
        title: 'Connect',
        body: 'Keep Umami Cloud or enter your server and paste a key from Settings → API keys in Umami, or run npm run deploy for Umapp’s own server, which fills both in.',
      },
      {
        value: '03',
        title: 'Browse',
        body: 'Change the range, sort the websites, or open one for its breakdown.',
      },
    ] satisfies Column[],
  },

  start: {
    title: 'Get Umapp.',
    lead: 'Install or update it on macOS with one command, or download the disk image.',
    button: 'Download from GitHub',
    notes: 'Release notes',
    requirements: 'For macOS on Apple silicon. The iPhone app builds from source with Go 1.27 or later and Xcode.',
  },

  built: {
    title: 'Built with NSGo',
    body: 'Umapp is written in Go with NSGo: one native UI for the Mac’s menu bar and window and the iPhone, in English and Chinese.',
    nsgo: 'nsgo.dev',
    nsgoRepo: 'GitHub',
  },

  footer: {
    note: 'Your Umami, in the menu bar.',
    links: 'Project',
    readme: 'README',
    changelog: 'Changelog',
    issues: 'Issues',
    license: 'MIT License',
  },

  notFound: {
    title: 'Page not found — Umapp',
    heading: 'No visitors here.',
    body: 'The address is gone, or it never existed. Umapp lives on the home page.',
    back: 'Back to Umapp',
  },
};

const zh: typeof en = {
  meta: {
    title: 'Umapp — 菜单栏里的 Umami',
    description:
      'Umapp 是一个原生应用，在 macOS 上有菜单栏和窗口两种形态，也能在 iPhone 上运行，显示你的网站以及此刻谁在访问，数据来自 Umami 或它自己在 Cloudflare 上的服务端。免费开源。',
    ogAlt: 'Umapp — 菜单栏里的 Umami',
  },

  nav: {
    skip: '跳到内容',
    primary: '主导航',
    home: 'Umapp 首页',
    links: [
      { label: '功能', href: '#features' },
      { label: '窗口', href: '#window' },
      { label: '单个网站', href: '#site' },
      { label: 'iPhone', href: '#iphone' },
      { label: '快速开始', href: '#start' },
    ],
    github: 'GitHub',
    cta: '下载',
    menu: '打开菜单',
    close: '关闭菜单',
    menuLabel: '菜单',
  },

  theme: { label: '外观', light: '浅色', dark: '深色', system: '跟随系统' },
  language: { label: '语言', en: 'English', zh: '中文' },
  code: { copy: '复制代码', command: '复制命令' },

  lightbox: {
    label: '截图',
    enlarge: '放大',
    close: '关闭',
    previous: '上一张',
    next: '下一张',
  },

  hero: {
    badge: { tag: '新', text: 'Umapp 支持 macOS 和 iPhone' },
    title: '你的 Umami\n就在菜单栏',
    lede: 'Umapp 显示 Umami 账户下的每个网站、它们的访客和浏览，以及此刻有多少人在线——从菜单栏点一下就能看到，想看得更全时也可以打开窗口。',
    primary: '下载 Umapp',
    secondary: '在 GitHub 查看',
    fine: '免费开源 · MIT · 自动更新',
    tone: 'green',
    shots: {
      list: {
        alt: 'Umapp 的面板：7 天内的访客和浏览，以及五个网站各自的在线访客、趋势和变化',
        caption: '每个网站、它们的访客，以及此刻谁在线。',
      },
    },
  },

  names: {
    title: '适用于',
    names: ['Umami Cloud', '自建 Umami', 'Umapp 服务端'],
    note: '任何像 Umami 一样应答的服务器，只需一个 API 密钥，包括 Umapp 自己在 Cloudflare Workers 上的服务端',
  },

  features: {
    title: '一眼看清网站数据',
    lead: '打开面板，看看网站情况，再关上。只需一个 API 密钥，或用一条命令部署你自己的服务端。',
    items: [
      {
        led: 'green',
        title: '此刻谁在线',
        body: '菜单栏图标旁、每个网站上，以及它的每个标签、页面和国家/地区上，都显示在线访客。不想看时可以关掉图标旁的数字。',
      },
      {
        led: 'blue',
        title: '所有网站，一个列表',
        body: '密钥能看到的每个网站都在这里，附上图标、域名和趋势，按访客、浏览或名称排序。',
      },
      {
        led: 'violet',
        title: '和上一段对比',
        body: '按 24 小时、7 天、30 天或 90 天显示访客和浏览，并与上一段时间对比。',
      },
      {
        led: 'amber',
        title: '用 Umami，或完全不用',
        body: '连接 Umami Cloud 或你自己的服务器，或者用一条命令把 Umapp 自有服务端部署到 Cloudflare：同一个账号下的网站无需嵌入代码即可统计。',
      },
      {
        led: 'teal',
        title: '管理你的网站',
        body: '在设置或网站页面中添加、改名或删除网站，复制要嵌入的跟踪代码，并查看访问数据是否已经到达。',
      },
      {
        led: 'pink',
        title: '原生，而且保持最新',
        body: '可以开机时启动，并自己刷新数据：在线访客每分钟一次，其余每五分钟一次。签名的版本就地安装更新，界面支持英文和简体中文。',
      },
    ],
  },

  window: {
    title: '需要更大空间时，打开窗口',
    lead: '在窗口中打开 Umapp：侧边栏列出所有网站和各自的在线人数，网站页面以宽布局显示，页面、来源和国家/地区并排排列。窗口打开时 Umapp 才会出现在程序坞中。',
    alt: 'Umapp 的窗口：侧边栏列出网站，旁边是 NSGo 网站的页面，包括指标、图表，以及并排的页面、来源和国家/地区',
    caption: '窗口：侧边栏是所有网站，旁边打开其中一个。',
    tone: 'amber',
  },

  site: {
    title: '打开网站看明细',
    lead: '跳出率、访问时长和指针悬停显示数量的图表，再往下是热门页面、来源和国家/地区，可看全部事件或只看某个标签。',
    alt: 'Umapp 中的单个网站：标签、六项指标和按天的访客与浏览图表',
    caption: 'NSGo 网站最近 7 天的数据，以及各标签的在线访客。',
    tone: 'blue',
    notes: [
      { led: 'green', title: '标签', body: '只看某个标签的数据，或全部一起看。' },
      { led: 'blue', title: '图表', body: '按小时或按天，指针下显示数量。' },
      { led: 'amber', title: '明细', body: '页面、带图标的来源、带国旗的国家/地区。' },
    ],
  },

  cards: {
    title: '在 Mac 上，在 iPhone 上，也在你的服务器上',
    lead: '同一个应用，为各自而做；如果不想运行 Umami，还有一个可以统计的服务端。',
    items: [
      {
        icon: 'monitor',
        kicker: 'macOS',
        title: '在菜单栏里，也在窗口里',
        body: '左键打开面板；右键菜单、⌘0 或再次打开 Umapp 会打开窗口。用一条命令或磁盘映像安装，之后 Umapp 会自动保持更新。',
        link: '下载',
        href: '#start',
      },
      {
        icon: 'phone',
        kicker: 'iPhone',
        title: '面板铺满屏幕',
        body: 'iPhone 应用直接打开面板，回到前台时自动刷新。需要用 Go 和 Xcode 从源码构建。',
        link: '构建',
        href: '#iphone',
      },
      {
        icon: 'server',
        kicker: 'Cloudflare',
        title: '你自己的服务端',
        body: 'npm run deploy 会把 Umapp 服务端部署到 Cloudflare Workers，无需嵌入代码即可统计同一账号下的网站，并打开你 Mac 上的 Umapp 来连接。',
        link: '部署',
        href: site.serverZh,
      },
    ],
  },

  iphone: {
    title: '口袋里也有',
    lead: '在 iPhone 上，面板铺满屏幕：同样的列表、同样的网站、同样的数据。',
    tone: 'violet',
    shots: {
      list: {
        alt: 'iPhone 上的 Umapp：网站和访客',
        caption: 'iPhone 上的列表。',
      },
      site: {
        alt: 'iPhone 上的单个网站：标签、指标和图表',
        caption: 'iPhone 上的单个网站。',
      },
    },
    link: '构建 iPhone 应用',
  },

  steps: {
    title: '三步看到你的数据',
    lead: '启动 Umapp，给它一个密钥，面板就会填满。',
    items: [
      {
        value: '01',
        title: '启动 Umapp',
        body: '它会在菜单栏添加一个图标，点击即可打开面板。',
      },
      {
        value: '02',
        title: '连接',
        body: '保留 Umami Cloud 或填入你的服务器，再粘贴在 Umami 的设置 → API 密钥中创建的密钥；或者运行 npm run deploy 部署 Umapp 自有服务端，它会帮你填好这两项。',
      },
      {
        value: '03',
        title: '浏览',
        body: '切换时间范围、为网站排序，或打开某个网站查看明细。',
      },
    ],
  },

  start: {
    title: '获取 Umapp',
    lead: '在 macOS 上用一条命令安装或更新，也可以下载磁盘映像。',
    button: '从 GitHub 下载',
    notes: '更新日志',
    requirements: '适用于 Apple 芯片的 macOS。iPhone 版需用 Go 1.27 或更高版本和 Xcode 从源码构建。',
  },

  built: {
    title: '用 NSGo 构建',
    body: 'Umapp 用 Go 和 NSGo 编写：一套原生界面，同时用于 Mac 的菜单栏和窗口以及 iPhone，支持英文和中文。',
    nsgo: 'nsgo.dev',
    nsgoRepo: 'GitHub',
  },

  footer: {
    note: '菜单栏里的 Umami。',
    links: '项目',
    readme: 'README',
    changelog: '更新日志',
    issues: '问题反馈',
    license: 'MIT 许可证',
  },

  notFound: {
    title: '页面未找到 — Umapp',
    heading: '这里没有访客',
    body: '地址不在了，或者从未存在。Umapp 在首页。',
    back: '回到 Umapp',
  },
};

export const copies: Record<Lang, typeof en> = { en, zh };

export type Copy = typeof en;
