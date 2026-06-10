import rss from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '398的美股策略',
    description: '美股研报、市场观点与持仓盈亏记录。',
    site: context.site,
    items: [
      {
        title: '美股科技板块观察：AI算力主线仍需结合估值和盈利验证',
        pubDate: new Date('2026-05-24'),
        description: '记录美股科技板块的阶段观察与风险变化。',
        link: '/articles/us-tech-weekly-2026-05-24/',
      },
      {
        title: '第 2 期持仓与盈亏记录',
        pubDate: new Date('2026-05-14'),
        description: '记录 2026-04-17 至 2026-05-14 的完整持仓与阶段盈亏。',
        link: '/articles/stock_hold_2026-05-14/',
      },
      {
        title: '第 1 期持仓与盈亏记录',
        pubDate: new Date('2026-04-16'),
        description: '记录 2026-03-19 至 2026-04-16 的完整持仓与阶段盈亏。',
        link: '/articles/stock_hold_2026-04-16/',
      },
    ],
  });
}
