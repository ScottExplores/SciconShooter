"""Reward semantics use applied native life units, never terminal presentation."""
import pytest
from scicon_fly.server import Coordinator, calculate_outcome_reward


def loss(before,count):
    return {'type':'player-life-lost','count':count,'livesBefore':before,'livesRemaining':before-count}


def transition(before_lives,after_lives,events,before_kills=0,after_kills=0):
    previous={'lives':before_lives,'enemiesDefeated':before_kills}
    result={'state':{'lives':after_lives,'enemiesDefeated':after_kills},'events':events}
    return calculate_outcome_reward(previous,result)


def test_nonterminal_damage_costs_one_penalty_per_actual_life():
    assert transition(3,2,[loss(3,1)])==-5
    assert transition(3,1,[loss(3,1),loss(2,1)])==-10


def test_terminal_presentation_never_double_counts_damage():
    terminal={'type':'player-death','livesRemaining':0}
    assert transition(1,0,[loss(1,1),terminal])==-5
    assert transition(1,0,[loss(1,1),terminal,terminal])==-5
    assert transition(0,0,[terminal])==0


def test_multi_life_damage_sums_count_instead_of_event_cardinality():
    assert transition(3,0,[loss(3,3),{'type':'player-death'}])==-15
    assert transition(3,0,[loss(3,3),{'type':'player-death'}],7,9)==-13


def test_same_decision_pickup_does_not_cancel_actual_life_loss():
    gained={'type':'player-life-gained','count':1,'livesBefore':2,'livesRemaining':3}
    assert transition(3,3,[loss(3,1),gained])==-5
    assert transition(3,3,[loss(3,1),gained],4,6)==-3
    assert transition(2,3,[gained])==0


def test_only_confirmed_counter_increases_reward_kills():
    assert transition(3,3,[],5,8)==3
    assert transition(3,3,[{'type':'entity-damage','damage':99},{'type':'enemy-spawn'}],5,5)==0
    with pytest.raises(ValueError,match='kill counter decreased'):
        transition(3,3,[],8,7)


@pytest.mark.parametrize('count',[0,-1,1.0,True,'1',None,float('nan')])
def test_invalid_life_loss_count_interrupts_instead_of_silently_penalizing(count):
    event={'type':'player-life-lost','count':count,'livesBefore':3,'livesRemaining':2}
    with pytest.raises(ValueError,match='count must be a positive integer'):
        transition(3,2,[event])


def test_inconsistent_or_missing_life_loss_telemetry_is_rejected():
    with pytest.raises(ValueError,match='transition does not match count'):
        transition(3,2,[{'type':'player-life-lost','count':2,'livesBefore':3,'livesRemaining':2}])
    with pytest.raises(ValueError,match='missing player-life-lost'):
        transition(1,0,[{'type':'player-death','livesRemaining':0}])
    with pytest.raises(ValueError,match='event must be an object'):
        transition(3,3,[None])
    with pytest.raises(ValueError,match='state and event list'):
        calculate_outcome_reward({'lives':3,'enemiesDefeated':0},{'state':{'lives':3,'enemiesDefeated':0}})


class MemoryWriter:
    def __init__(self):self.closed=False;self.rewards=[];self.summary=None
    def append(self,seq,action,result,reward,neural):self.rewards.append(reward)
    def finish(self,summary):self.summary=summary;self.closed=True


class SequenceDriver:
    def __init__(self,results):self.results=iter(results);self.commands=[]
    def call(self,command):self.commands.append(command);return next(self.results)


def coordinator_with_results(results):
    coordinator=Coordinator()
    coordinator.config={'controller':'manual','constantFire':False,'seed':17}
    coordinator.run_id='UNIT_TEST_REWARD_TRANSITIONS'
    coordinator.latest={'state':{'lives':3,'enemiesDefeated':0,'score':0},'terminated':False,'truncated':False}
    coordinator.writer=MemoryWriter();coordinator.driver=SequenceDriver(results)
    # Avoid unrelated filesystem/dataset discovery in a reward-path unit test.
    coordinator.public=lambda:{'totalReward':coordinator.total_reward,'status':coordinator.status}
    return coordinator


def result(tick,lives,kills,events,terminated=False):
    return {'tick':tick,'simTimeMs':tick*1000/60,'state':{'lives':lives,'enemiesDefeated':kills,'score':10*kills},
            'events':events,'terminated':terminated,'truncated':False}


def test_coordinator_records_nonterminal_and_terminal_reward_without_double_counting():
    gain={'type':'player-life-gained','count':1,'livesBefore':2,'livesRemaining':3}
    c=coordinator_with_results([
        result(3,2,1,[loss(3,1)]),
        result(6,2,3,[gain,loss(3,1)]),
        result(9,0,4,[loss(2,2),{'type':'player-death','livesRemaining':0}],True)
    ])
    for _ in range(3):c.step({'movement':'W','fire':True})
    assert c.writer.rewards==[-4,-3,-9]
    assert [row['reward'] for row in c.history]==[-4,-3,-9]
    assert c.total_reward==-16 and c.seq==3 and c.status=='completed'
    assert c.writer.summary['reward']==-16 and c.writer.summary['lives']==0
    assert c.writer.summary['status']=='completed' and c.writer.closed


def test_coordinator_interrupts_stale_damage_telemetry_without_recording_a_fake_reward():
    c=coordinator_with_results([result(3,2,0,[])])
    with pytest.raises(ValueError,match='missing player-life-lost'):
        c.step({'movement':'idle','fire':False})
    assert c.status=='error' and c.seq==0 and c.total_reward==0
    assert c.history==[] and c.writer.rewards==[]
    assert c.writer.closed and c.writer.summary['status']=='interrupted'
