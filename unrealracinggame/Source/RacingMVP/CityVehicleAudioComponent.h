#pragma once

#include "Components/ActorComponent.h"
#include "CityVehicleAudioComponent.generated.h"

class UAudioComponent;
class UChaosWheeledVehicleMovementComponent;
class UPrimitiveComponent;
class USoundBase;
struct FHitResult;

UCLASS()
class RACINGMVP_API UCityVehicleAudioComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UCityVehicleAudioComponent();

protected:
    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

private:
    UFUNCTION()
    void HandleVehicleHit(UPrimitiveComponent* HitComponent, AActor* OtherActor,
        UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);

    UPROPERTY()
    TObjectPtr<USoundBase> IdleSound;

    UPROPERTY()
    TObjectPtr<USoundBase> HighSound;

    UPROPERTY()
    TObjectPtr<USoundBase> WindSound;

    UPROPERTY()
    TObjectPtr<USoundBase> SkidSound;

    UPROPERTY()
    TObjectPtr<USoundBase> CollisionSound;

    UPROPERTY()
    TObjectPtr<UChaosWheeledVehicleMovementComponent> Movement;

    UPROPERTY()
    TObjectPtr<UAudioComponent> IdleAudio;

    UPROPERTY()
    TObjectPtr<UAudioComponent> HighAudio;

    UPROPERTY()
    TObjectPtr<UAudioComponent> WindAudio;

    UPROPERTY()
    TObjectPtr<UAudioComponent> SkidAudio;

    int32 PreviousGear = 0;
    float ShiftDip = 0.0f;
    float LastCollisionTime = -10.0f;
};
