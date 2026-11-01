import { Role, ThreadChannel } from '@prisma/client';
import { staffCanSee, staffThreadWhere } from './access';

const base = { memberIds: [] as string[], hasWedding: true, weddingPlannerId: 'p1' };
describe('messaging access', () => {
  it('admin sees everything', () => {
    expect(staffThreadWhere({ id: 'a', role: Role.FOUNDER })).toEqual({});
    expect(staffCanSee({ id: 'a', role: Role.FOUNDER }, { ...base, channel: ThreadChannel.CLIENT })).toBe(true);
  });
  it('planner only sees client threads of own weddings', () => {
    expect(staffCanSee({ id: 'p1', role: Role.PLANNER }, { ...base, channel: ThreadChannel.CLIENT })).toBe(true);
    expect(staffCanSee({ id: 'p2', role: Role.PLANNER }, { ...base, channel: ThreadChannel.CLIENT })).toBe(false);
    expect(staffCanSee({ id: 'p2', role: Role.PLANNER }, { ...base, weddingPlannerId: null, channel: ThreadChannel.CLIENT })).toBe(true);
  });
  it('finance only sees planner channel and team chat', () => {
    const f = { id: 'f', role: Role.FINANCE };
    expect(staffCanSee(f, { ...base, channel: ThreadChannel.PLANNER })).toBe(true);
    expect(staffCanSee(f, { ...base, channel: ThreadChannel.TEAM })).toBe(true);
    expect(staffCanSee(f, { ...base, channel: ThreadChannel.CLIENT })).toBe(false);
    expect(staffCanSee(f, { ...base, channel: ThreadChannel.VENDOR })).toBe(false);
  });
  it('members always see their thread; ops sees vendor threads', () => {
    expect(staffCanSee({ id: 'o', role: Role.OPERATIONS }, { ...base, channel: ThreadChannel.CLIENT, memberIds: ['o'] })).toBe(true);
    expect(staffCanSee({ id: 'o', role: Role.OPERATIONS }, { ...base, channel: ThreadChannel.VENDOR })).toBe(true);
    expect(staffCanSee({ id: 'o', role: Role.OPERATIONS }, { ...base, channel: ThreadChannel.CLIENT })).toBe(false);
  });
});
