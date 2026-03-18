export const formatMoney = (cents: number) => {
  return `$${(cents / 100).toFixed(2)}`;
};
