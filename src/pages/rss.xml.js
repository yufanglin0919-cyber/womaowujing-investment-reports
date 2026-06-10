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
        title: '6月10日个股观察：当前持仓与AI科技主线复盘',
        pubDate: new Date('2026-06-10'),
        description: '观察八只美股科技公司的产业逻辑、业绩变化与主要风险。',
        link: '/articles/ai-stock-watch-2026-06-10/',
      },
      {
        title: '第 3 期持仓与盈亏记录',
        pubDate: new Date('2026-06-04'),
        description: '记录 2026-05-06 至 2026-06-04 的完整持仓与等权组合收益率。',
        link: '/articles/stock-hold-2026-06-04/',
      },
      {
        title: '第 2 期持仓与盈亏记录',
        pubDate: new Date('2026-05-05'),
        description: '记录 2026-04-08 至 2026-05-05 的完整持仓与等权组合收益率。',
        link: '/articles/stock-hold-2026-05-05/',
      },
      {
        title: '第 1 期持仓与盈亏记录',
        pubDate: new Date('2026-04-07'),
        description: '记录 2026-03-10 至 2026-04-07 的完整持仓与等权组合收益率。',
        link: '/articles/stock-hold-2026-04-07/',
      },
    ],
  });
}
