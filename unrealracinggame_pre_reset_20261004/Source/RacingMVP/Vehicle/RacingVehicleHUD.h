#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "RacingVehicleHUD.generated.h"

UCLASS()
class RACINGMVP_API ARacingVehicleHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
