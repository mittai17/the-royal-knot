import { paymentSummary } from './clients.service';

describe('client payment summary', () => {
  it('outstanding is the larger of contract/expected minus received', () => {
    expect(paymentSummary(1000, 900, 400).outstanding).toBe(600);
    expect(paymentSummary(500, 900, 400).outstanding).toBe(500);
    expect(paymentSummary(100, 100, 300).outstanding).toBe(0);
  });
});
