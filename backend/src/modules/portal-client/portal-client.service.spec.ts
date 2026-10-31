import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScopeService } from '../../common/scope.service';
import { PortalClientService } from './portal-client.service';

const client = { id: 'u1', role: 'CLIENT', coupleId: 'c1', email: '', name: '', mustChangePassword: false } as never;
const day = 864e5;

function build(weddings: { id: string; startDate: Date; endDate: Date }[]) {
  const prisma = {
    wedding: {
      findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id?.in ? weddings.filter((w) => where.id.in.includes(w.id)).map((w) => ({ ...w, couple: {}, planner: null })) : [])),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => Promise.resolve({ ...weddings.find((w) => w.id === where.id), couple: {}, planner: null })),
    },
  };
  const scope = new ScopeService(prisma as never);
  jest.spyOn(scope, 'weddingIds').mockResolvedValue(weddings.map((w) => w.id));
  return new PortalClientService(prisma as never, scope, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
}

describe('PortalClientService.resolveWedding', () => {
  const past = { id: 'past', startDate: new Date(Date.now() - 90 * day), endDate: new Date(Date.now() - 88 * day) };
  const soon = { id: 'soon', startDate: new Date(Date.now() + 10 * day), endDate: new Date(Date.now() + 12 * day) };
  it('prefers the next upcoming wedding, else the latest', async () => {
    expect((await build([past, soon]).resolveWedding(client)).id).toBe('soon');
    expect((await build([past]).resolveWedding(client)).id).toBe('past');
  });
  it('refuses a wedding id that is not the couple\'s own', async () => {
    await expect(build([soon]).resolveWedding(client, 'other')).rejects.toBeInstanceOf(ForbiddenException);
    expect((await build([soon]).resolveWedding(client, 'soon')).id).toBe('soon');
  });
  it('404s when the couple has no wedding and 403s when the account has no couple', async () => {
    await expect(build([]).resolveWedding(client)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build([soon]).resolveWedding({ ...(client as object), coupleId: null } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
