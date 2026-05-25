import rss from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '猫捂京的美股投策',
    description: '美股科技股研究、纳斯达克市场观察和量化策略复盘',
    site: context.site,
    items: [
      {
        title: '本周美股科技股观察：AI算力主线仍然强势',
        pubDate: new Date('2026-05-24'),
        description: '从AI算力、半导体、云计算、数据中心、宏观利率和估值风险等角度复盘本周美股科技股表现。',
        link: '/articles/ai-computing-2026-05-24/',
      },
      {
        title: '2026-05-14 调仓收益记录',
        pubDate: new Date('2026-05-14'),
        description: '本次调仓收益记录。',
        link: '/articles/rebalance-2026-05-14/',
      },
      {
        title: '2026-04-16 调仓收益记录',
        pubDate: new Date('2026-04-16'),
        description: '本次调仓收益记录。',
        link: '/articles/rebalance-2026-04-16/',
      },
    ],
  });
}