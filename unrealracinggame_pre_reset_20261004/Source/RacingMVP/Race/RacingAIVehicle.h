#pragma once

#include "CoreMinimal.h"
#include "Vehicle/RacingPlayerVehicle.h"
#include "RacingAIVehicle.generated.h"

UCLASS()
class RACINGMVP_API ARacingAIVehicle : public ARacingPlayerVehicle
{
    GENERATED_BODY()
public:
    ARacingAIVehicle(const FObjectInitializer& ObjectInitializer);
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    void ConfigureRaceLine(float InLaneY, float InTargetSpeedKmh, int32 InColorIndex);
    void SetRaceRunning(bool bRunning);

private:
    float LaneY = 29250.0f;
    float TargetSpeedKmh = 95.0f;
    float StuckSeconds = 0.0f;
    float DebugClock = 0.0f;
    bool bRaceRunning = false;
    int32 ColorIndex = 0;
};
