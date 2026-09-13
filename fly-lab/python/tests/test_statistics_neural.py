import numpy as np
import pytest
from scicon_fly.statistics import holm_adjust, paired_replica_estimate, factorial_interaction, required_replicas, restricted_survival


def test_holm_preserves_original_order_and_monotonic_ranks():
    np.testing.assert_allclose(holm_adjust([.04,.001,.02]),[.04,.003,.04])
    assert holm_adjust([])==[]
    with pytest.raises(ValueError):
        holm_adjust([float('nan')])


def test_replica_unit_not_episode_pseudoreplication():
    before=np.zeros((4,1000)); after=np.ones((4,1000))
    estimate=paired_replica_estimate(before,after,bootstrap_samples=100)
    assert estimate['replicas']==4 and estimate['pValue']==.125
    assert estimate['bootstrapCI']==[1,1] and estimate['pairedStandardizedEffect'] is None
    with pytest.raises(ValueError):
        paired_replica_estimate(np.zeros((1,1000)),np.ones((1,1000)))


def test_factorial_topology_interaction_not_simple_control_difference():
    fixed=np.arange(8,dtype=float)
    result=factorial_interaction(fixed,fixed+3,fixed-5,fixed-4,bootstrap_samples=100)
    assert result['meanDelta']==2 and result['replicas']==8
    equal=factorial_interaction(fixed,fixed+3,fixed-5,fixed-2,bootstrap_samples=100)
    assert equal['meanDelta']==0 and equal['pValue']==1


def test_power_estimate_increases_for_smaller_effect_multiple_tests():
    first=required_replicas(1,2)['independentReplicasPerCondition']
    assert required_replicas(.5,2)['independentReplicasPerCondition']>first
    assert required_replicas(1,2,comparisons=3)['independentReplicasPerCondition']>first
    with pytest.raises(ValueError):
        required_replicas(0,2)


def test_survival_crash_not_silently_counted_as_death_or_horizon():
    r=restricted_survival([2,5,10],[False,False,True],10)
    assert r['restrictedMean']==17/3 and r['administrativelyCensored']==1
    with pytest.raises(ValueError,match='Early censoring'):
        restricted_survival([2,5],[False,True],10)
