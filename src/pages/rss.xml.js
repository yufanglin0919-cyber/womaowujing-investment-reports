import rss from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '398的美股策略',
    description: '美股研报、市场观点与持仓盈亏记录。',
    site: context.site,
    items: [
      {
        title: '6月10日美股市场观点：科技主线降温，宏观压力重新抬头',
        pubDate: new Date('2026-06-10'),
        description: '复盘科技股估值、通胀压力、利率预期与市场风险变化。',
        link: '/articles/us-market-view-2026-06-10/',
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
