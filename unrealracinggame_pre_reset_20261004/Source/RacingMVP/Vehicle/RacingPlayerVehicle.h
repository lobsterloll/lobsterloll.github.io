#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "RacingPlayerVehicle.generated.h"

class UCameraComponent;
class UAudioComponent;
class UChaosWheeledVehicleMovementComponent;
class UInputAction;
class UInputMappingContext;
class USpringArmComponent;
class UStaticMeshComponent;
class ULightComponent;
class UMaterialInterface;
class UVehiclePresentationComponent;
struct FInputActionValue;

UENUM(BlueprintType)
enum class ERacingCameraMode : uint8 { Chase, CloseChase, Cockpit, Hood };

UCLASS()
class RACINGMVP_API ARacingPlayerVehicle : public AWheeledVehiclePawn
{
    GENERATED_BODY()
public:
    ARacingPlayerVehicle(const FObjectInitializer& ObjectInitializer);
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    UFUNCTION(BlueprintPure, Category="Racing|Vehicle")
    UChaosWheeledVehicleMovementComponent* GetChaosMovement() const;

    UFUNCTION(BlueprintPure, Category="Racing|Vehicle")
    UVehiclePresentationComponent* GetPresentation() const { return Presentation; }

    void SetRaceControlLocked(bool bLocked);
    void SetRaceAIInputs(float Throttle, float Brake, float Steering);
    void EnableRaceAI();
    void TeleportRaceVehicle(const FTransform& Target);
    void SetRaceResetTransform(const FTransform& Target) { ResetTransform = Target; }
    void SetProxyPaint(UMaterialInterface* Paint);


private:
    UPROPERTY(VisibleAnywhere, Category="Racing|Camera") TObjectPtr<USpringArmComponent> CameraArm;
    UPROPERTY(VisibleAnywhere, Category="Racing|Camera") TObjectPtr<UCameraComponent> Camera;
    UPROPERTY(VisibleAnywhere, Category="Racing|P0") TArray<TObjectPtr<UStaticMeshComponent>> P0ProxyParts;
    UPROPERTY(VisibleAnywhere, Category="Racing|Vehicle") TObjectPtr<UVehiclePresentationComponent> Presentation;
    UPROPERTY(VisibleAnywhere, Category="Racing|Audio") TObjectPtr<UAudioComponent> EngineAudio;
    UPROPERTY(VisibleAnywhere, Category="Racing|Audio") TObjectPtr<UAudioComponent> TireAudio;
    UPROPERTY(VisibleAnywhere, Category="Racing|Audio") TObjectPtr<UAudioComponent> WindAudio;
    UPROPERTY(VisibleAnywhere, Category="Racing|Audio") TObjectPtr<UAudioComponent> GravelAudio;
    UPROPERTY(Transient) TObjectPtr<UInputMappingContext> DrivingContext;
    UPROPERTY(Transient) TObjectPtr<UInputMappingContext> UIContext;
    UPROPERTY(Transient) TArray<TObjectPtr<UInputAction>> InputActions;
    ERacingCameraMode CameraMode = ERacingCameraMode::Chase;
    bool bThrottleHeld = false;
    bool bBrakeHeld = false;
    bool bLeftHeld = false;
    bool bRightHeld = false;
    bool bHandbrakeHeld = false;
    bool bHeadlightsOn = false;
    bool bLeftIndicatorOn = false;
    bool bRightIndicatorOn = false;
    bool bRaceControlLocked = false;
    bool bRaceAI = false;
    float RaceAIThrottle = 0.0f;
    float RaceAIBrake = 0.0f;
    float RaceAISteering = 0.0f;
    float SmoothedSteering = 0.0f;
    float TelemetryClock = 0.0f;
    FTransform ResetTransform;

    void ThrottlePressed(const FInputActionValue&);
    void ThrottleReleased(const FInputActionValue&);
    void BrakePressed(const FInputActionValue&);
    void BrakeReleased(const FInputActionValue&);
    void LeftPressed(const FInputActionValue&);
    void LeftReleased(const FInputActionValue&);
    void RightPressed(const FInputActionValue&);
    void RightReleased(const FInputActionValue&);
    void HandbrakePressed(const FInputActionValue&);
    void HandbrakeReleased(const FInputActionValue&);
    void CycleCamera(const FInputActionValue&);
    void ResetCar(const FInputActionValue&);
    void ToggleHeadlights(const FInputActionValue&);
    void ToggleLeftIndicator(const FInputActionValue&);
    void ToggleRightIndicator(const FInputActionValue&);
    void RaceInteract(const FInputActionValue&);
    void RacePause(const FInputActionValue&);
    void RaceRestart(const FInputActionValue&);
    void RaceLeave(const FInputActionValue&);
};
