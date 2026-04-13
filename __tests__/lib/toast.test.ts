import { parseToastCsv, computeTheoreticalUsage } from '@/lib/toast';

const sampleCsv = `Menu Item,Quantity Sold
Negroni,47
Old Fashioned,62
Aperol Spritz,38
`;

const recipes = [
  {
    id: 'r1', name: 'Negroni', toast_menu_item_name: 'Negroni',
    ingredients: [
      { bottle_id: 'b-gin', ingredient_name: "Hendrick's Gin", quantity_oz: 1, tracked: true },
      { bottle_id: 'b-campari', ingredient_name: 'Campari', quantity_oz: 1, tracked: true },
      { bottle_id: null, ingredient_name: 'Sweet Vermouth', quantity_oz: 1, tracked: false },
    ],
  },
  {
    id: 'r2', name: 'Old Fashioned', toast_menu_item_name: 'Old Fashioned',
    ingredients: [
      { bottle_id: 'b-bourbon', ingredient_name: 'Bulleit Bourbon', quantity_oz: 2, tracked: true },
    ],
  },
];

describe('parseToastCsv', () => {
  it('extracts menu item names and quantities', () => {
    const sales = parseToastCsv(sampleCsv);
    expect(sales).toHaveLength(3);
    const negroni = sales.find(s => s.menuItemName === 'Negroni');
    expect(negroni?.unitsSold).toBe(47);
  });
});

describe('computeTheoreticalUsage', () => {
  it('calculates ml per bottle_id from sales × recipe oz', () => {
    const sales = [
      { menuItemName: 'Negroni', unitsSold: 47 },
      { menuItemName: 'Old Fashioned', unitsSold: 62 },
    ];
    const usage = computeTheoreticalUsage(sales, recipes as any);

    expect(usage['b-gin']).toBeCloseTo(47 * 1 * 29.5735, 0);
    expect(usage['b-bourbon']).toBeCloseTo(62 * 2 * 29.5735, 0);
    expect(usage['b-vermouth']).toBeUndefined();
  });
});
