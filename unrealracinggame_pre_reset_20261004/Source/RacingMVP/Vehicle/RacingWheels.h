#pragma once
#include "CoreMinimal.h"
#include "ChaosVehicleWheel.h"
#include "RacingWheels.generated.h"

UCLASS()
class RACINGMVP_API URacingFrontWheel : public UChaosVehicleWheel
{
    GENERATED_BODY()
public:
    URacingFrontWheel();
};

UCLASS()
class RACINGMVP_API URacingRearWheel : public UChaosVehicleWheel
{
    GENERATED_BODY()
public:
    URacingRearWheel();
};
