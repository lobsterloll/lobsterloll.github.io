#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "VehiclePresentationComponent.generated.h"

class UChaosWheeledVehicleMovementComponent;
class ULightComponent;

USTRUCT(BlueprintType)
struct FRacingVehicleState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) float SpeedKmh = 0.0f;
    UPROPERTY(BlueprintReadOnly) float EngineRPM = 0.0f;
    UPROPERTY(BlueprintReadOnly) int32 Gear = 0;
    UPROPERTY(BlueprintReadOnly) float Throttle = 0.0f;
    UPROPERTY(BlueprintReadOnly) float Brake = 0.0f;
    UPROPERTY(BlueprintReadOnly) float Steering = 0.0f;
    UPROPERTY(BlueprintReadOnly) bool bHandbrake = false;
    UPROPERTY(BlueprintReadOnly) bool bHeadlights = false;
    UPROPERTY(BlueprintReadOnly) bool bLeftIndicator = false;
    UPROPERTY(BlueprintReadOnly) bool bRightIndicator = false;
    UPROPERTY(BlueprintReadOnly) float WheelSlip = 0.0f;
    UPROPERTY(BlueprintReadOnly) int32 GroundedWheels = 0;
    UPROPERTY(BlueprintReadOnly) TEnumAsByte<EPhysicalSurface> Surface = SurfaceType_Default;
};

UCLASS(ClassGroup=(Racing), meta=(BlueprintSpawnableComponent))
class RACINGMVP_API UVehiclePresentationComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UVehiclePresentationComponent();

    UPROPERTY(BlueprintReadOnly, Category="Racing|Vehicle") FRacingVehicleState State;
    void SetLights(ULightComponent* InLeftHeadlight, ULightComponent* InRightHeadlight,
        ULightComponent* InLeftBrake, ULightComponent* InRightBrake,
        ULightComponent* InReverse, ULightComponent* InLeftIndicator,
        ULightComponent* InRightIndicator);
    void UpdateFromVehicle(UChaosWheeledVehicleMovementComponent* Movement,
        float InThrottle, float InBrake, float InSteering, bool bInHandbrake,
        bool bInHeadlights, bool bInLeftIndicator, bool bInRightIndicator);

protected:
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    UPROPERTY(Transient) TObjectPtr<ULightComponent> LeftHeadlight;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> RightHeadlight;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> LeftBrake;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> RightBrake;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> ReverseLight;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> LeftIndicator;
    UPROPERTY(Transient) TObjectPtr<ULightComponent> RightIndicator;
    float BlinkTime = 0.0f;
};
