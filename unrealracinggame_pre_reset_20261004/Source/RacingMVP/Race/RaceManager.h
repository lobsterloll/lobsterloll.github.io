#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RaceManager.generated.h"

class ARacingPlayerVehicle;
class ARacingAIVehicle;
class UStaticMeshComponent;

UENUM()
enum class ERacePhase : uint8 { FreeDrive, Offer, Countdown, Racing, Results };

struct FRaceParticipant
{
    TWeakObjectPtr<ARacingPlayerVehicle> Vehicle;
    FString DisplayName;
    int32 NextGate = 0;
    float PreviousX = -41800.0f;
    float FinishTime = -1.0f;
    bool bDNF = false;
};

UCLASS()
class RACINGMVP_API ARaceManager : public AActor
{
    GENERATED_BODY()
public:
    ARaceManager();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    void HandleInteract();
    void HandlePause();
    void HandleRestart();
    void HandleLeave();

    ERacePhase GetPhase() const { return Phase; }
    bool IsRacePaused() const { return bRacePaused; }
    float GetCountdownRemaining() const { return CountdownRemaining; }
    float GetRaceElapsed() const { return RaceElapsed; }
    float GetGoFlashRemaining() const { return GoFlashRemaining; }
    int32 GetPlayerCheckpointCount() const;
    int32 GetPlayerRank() const;
    TArray<FString> GetResultLines() const;
    FVector GetOfferLocation() const { return OfferLocation; }

private:
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> OfferMarker;
    UPROPERTY(Transient) TArray<TObjectPtr<ARacingAIVehicle>> Opponents;
    UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> GateVisuals;
    TArray<FRaceParticipant> Participants;
    TArray<float> GateXs;
    ERacePhase Phase = ERacePhase::FreeDrive;
    bool bRacePaused = false;
    bool bAutoStartRequested = false;
    float CountdownRemaining = 0.0f;
    float GoFlashRemaining = 0.0f;
    float RaceElapsed = 0.0f;
    float ResultWait = 0.0f;
    const FVector OfferLocation = FVector(0.0f, -1900.0f, 150.0f);

    ARacingPlayerVehicle* GetPlayerCar() const;
    void StartRace();
    void EnterResults();
    void ReturnToFreeDrive();
    void UpdateProgress(FRaceParticipant& Participant);
    void CreateGateVisuals();
    void SetGateVisibility(bool bVisible);
};
