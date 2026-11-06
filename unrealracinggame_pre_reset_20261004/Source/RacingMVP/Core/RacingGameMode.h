#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "RacingGameMode.generated.h"

class ARaceManager;

UCLASS()
class RACINGMVP_API ARacingGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ARacingGameMode();
    virtual void BeginPlay() override;
    ARaceManager* GetRaceManager() const { return RaceManager; }

private:
    UPROPERTY(Transient) TObjectPtr<ARaceManager> RaceManager;
};
