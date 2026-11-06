#include "Core/RacingGameMode.h"
#include "RacingMVP.h"
#include "Vehicle/RacingPlayerVehicle.h"
#include "Vehicle/RacingVehicleHUD.h"
#include "Race/RaceManager.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

ARacingGameMode::ARacingGameMode()
{
    DefaultPawnClass = ARacingPlayerVehicle::StaticClass();
    HUDClass = ARacingVehicleHUD::StaticClass();
}

void ARacingGameMode::BeginPlay()
{
    Super::BeginPlay();

    APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0);
    const ARacingPlayerVehicle* Vehicle = Cast<ARacingPlayerVehicle>(Pawn);
    const bool bHasChaosMovement = Vehicle && Vehicle->GetChaosMovement();
    UE_LOG(LogRacingMVP, Display,
        TEXT("P0 visual check: pawn=%s, production Chaos wheeled movement=%s"),
        *GetNameSafe(Pawn), bHasChaosMovement ? TEXT("present") : TEXT("MISSING"));

    if (!bHasChaosMovement)
    {
        UE_LOG(LogRacingMVP, Error, TEXT("P0 vehicle was not spawned with Chaos movement."));
    }

    if (GetWorld() && GetWorld()->GetMapName().Contains(TEXT("L_OpenWorldDrive")))
    {
        RaceManager = GetWorld()->SpawnActor<ARaceManager>(ARaceManager::StaticClass());
        if (!RaceManager) UE_LOG(LogRacingMVP, Error, TEXT("P5 race manager failed to spawn"));
    }
}
