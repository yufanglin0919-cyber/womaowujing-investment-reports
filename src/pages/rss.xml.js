import rss from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '398的美股策略',
    description: '记录美股持仓、投资报告分析和历史持仓收益复盘。',
    site: context.site,
    items: [
      {
        title: '美股科技板块观察：AI算力主线仍需结合估值和盈利验证',
        pubDate: new Date('2026-05-24'),
        description: '从行业趋势、估值压力和盈利兑现三个角度整理一篇投资报告。',
        link: '/articles/us-tech-weekly-2026-05-24/',
      },
      {
        title: '2026-05-14 持仓收益记录',
        pubDate: new Date('2026-05-14'),
        description: '记录 2026-04-17 至 2026-05-14 这一轮持仓收益表现。',
        link: '/articles/stock_hold_2026-05-14/',
      },
      {
        title: '2026-04-16 持仓收益记录',
        pubDate: new Date('2026-04-16'),
        description: '记录 2026-03-19 至 2026-04-16 这一轮持仓收益表现。',
        link: '/articles/stock_hold_2026-04-16/',
      },
    ],
  });
}
