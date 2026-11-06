#include "Vehicle/RacingWheels.h"

URacingFrontWheel::URacingFrontWheel()
{
    WheelRadius = 39.0f;
    WheelWidth = 35.0f;
    FrictionForceMultiplier = 3.0f;
    SpringRate = 35000.0f;
    SuspensionMaxRaise = 10.0f;
    SuspensionMaxDrop = 20.0f;
    SuspensionDampingRatio = 0.65f;
    WheelLoadRatio = 0.35f;
    RollbarScaling = 0.3f;
    MaxBrakeTorque = 4500.0f;
    bAffectedBySteering = true;
    bAffectedByEngine = false;
    bAffectedByBrake = true;
    bAffectedByHandbrake = false;
}

URacingRearWheel::URacingRearWheel()
{
    WheelRadius = 40.0f;
    WheelWidth = 40.0f;
    FrictionForceMultiplier = 4.0f;
    SpringRate = 35000.0f;
    SuspensionMaxRaise = 10.0f;
    SuspensionMaxDrop = 20.0f;
    SuspensionDampingRatio = 0.65f;
    WheelLoadRatio = 0.35f;
    RollbarScaling = 0.4f;
    MaxSteerAngle = 0.0f;
    MaxBrakeTorque = 4500.0f;
    MaxHandBrakeTorque = 6000.0f;
    bAffectedBySteering = false;
    bAffectedByEngine = true;
    bAffectedByBrake = true;
    bAffectedByHandbrake = true;
}
