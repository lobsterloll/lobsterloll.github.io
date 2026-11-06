#include "Vehicle/VehiclePresentationComponent.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/LightComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

UVehiclePresentationComponent::UVehiclePresentationComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
}

void UVehiclePresentationComponent::SetLights(ULightComponent* InLeftHeadlight, ULightComponent* InRightHeadlight,
    ULightComponent* InLeftBrake, ULightComponent* InRightBrake, ULightComponent* InReverse,
    ULightComponent* InLeftIndicator, ULightComponent* InRightIndicator)
{
    LeftHeadlight = InLeftHeadlight;
    RightHeadlight = InRightHeadlight;
    LeftBrake = InLeftBrake;
    RightBrake = InRightBrake;
    ReverseLight = InReverse;
    LeftIndicator = InLeftIndicator;
    RightIndicator = InRightIndicator;
}

void UVehiclePresentationComponent::UpdateFromVehicle(UChaosWheeledVehicleMovementComponent* Movement,
    float InThrottle, float InBrake, float InSteering, bool bInHandbrake,
    bool bInHeadlights, bool bInLeftIndicator, bool bInRightIndicator)
{
    if (!Movement) return;
    State.SpeedKmh = Movement->GetForwardSpeed() * 0.036f;
    State.EngineRPM = Movement->GetEngineRotationSpeed();
    State.Gear = Movement->GetCurrentGear();
    State.Throttle = InThrottle;
    State.Brake = InBrake;
    State.Steering = InSteering;
    State.bHandbrake = bInHandbrake;
    State.bHeadlights = bInHeadlights;
    State.bLeftIndicator = bInLeftIndicator;
    State.bRightIndicator = bInRightIndicator;
    State.WheelSlip = 0.0f;
    State.GroundedWheels = 0;
    State.Surface = SurfaceType_Default;
    for (int32 Index = 0; Index < Movement->GetNumWheels(); ++Index)
    {
        const FWheelStatus& Wheel = Movement->GetWheelState(Index);
        if (!Wheel.bInContact) continue;
        ++State.GroundedWheels;
        State.WheelSlip = FMath::Max(State.WheelSlip, FMath::Max(Wheel.SlipMagnitude, Wheel.SkidMagnitude));
        if (const UPhysicalMaterial* Material = Wheel.PhysMaterial.Get()) State.Surface = Material->SurfaceType;
    }
}

void UVehiclePresentationComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    BlinkTime = FMath::Fmod(BlinkTime + DeltaTime, 1.0f);
    const bool bBlinkOn = BlinkTime < 0.5f;
    if (LeftHeadlight) LeftHeadlight->SetVisibility(State.bHeadlights);
    if (RightHeadlight) RightHeadlight->SetVisibility(State.bHeadlights);
    const bool bBraking = State.Brake > 0.05f || State.bHandbrake;
    if (LeftBrake) LeftBrake->SetVisibility(bBraking);
    if (RightBrake) RightBrake->SetVisibility(bBraking);
    if (ReverseLight) ReverseLight->SetVisibility(State.Gear < 0);
    if (LeftIndicator) LeftIndicator->SetVisibility(State.bLeftIndicator && bBlinkOn);
    if (RightIndicator) RightIndicator->SetVisibility(State.bRightIndicator && bBlinkOn);
}
