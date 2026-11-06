#pragma once

#include "GameFramework/HUD.h"
#include "CityVehicleHUD.generated.h"

class ACityInstancedGeometry;

UCLASS()
class RACINGMVP_API ACityVehicleHUD : public AHUD
{
    GENERATED_BODY()

public:
    virtual void DrawHUD() override;

private:
    TWeakObjectPtr<ACityInstancedGeometry> RoadCity;
};
