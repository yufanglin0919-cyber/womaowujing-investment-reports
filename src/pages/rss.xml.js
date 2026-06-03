import rss from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '398的美股策略｜美股科技投研',
    description: '面向中文读者的美股科技投研报告、行业观察和策略历史复盘。',
    site: context.site,
    items: [
      {
        title: '美股科技板块观察：AI算力主线仍需结合估值和盈利验证',
        pubDate: new Date('2026-05-24'),
        description: '按照固定投研报告结构整理行业逻辑、核心数据、估值位置、风险清单和后续跟踪指标。',
        link: '/articles/us-tech-weekly-2026-05-24/',
      },
      {
        title: '2026-05-14 策略复盘',
        pubDate: new Date('2026-05-14'),
        description: '复盘 2026-04-17 至 2026-05-14 这一轮等权组合表现、基准对比、胜率和错误复盘。',
        link: '/articles/stock_hold_2026-05-14/',
      },
      {
        title: '2026-04-16 策略复盘',
        pubDate: new Date('2026-04-16'),
        description: '复盘 2026-03-19 至 2026-04-16 这一轮等权组合表现、基准对比、胜率和错误复盘。',
        link: '/articles/stock_hold_2026-04-16/',
      },
    ],
  });
}
