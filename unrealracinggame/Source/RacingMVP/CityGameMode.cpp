#include "CityGameMode.h"
#include "CityPlayerController.h"
#include "CityVehicleHUD.h"
#include "UObject/ConstructorHelpers.h"

ACityGameMode::ACityGameMode()
{
    PlayerControllerClass = ACityPlayerController::StaticClass();
    HUDClass = ACityVehicleHUD::StaticClass();

    static ConstructorHelpers::FClassFinder<APawn> SportsCar(
        TEXT("/Game/VehicleTemplate/Blueprints/SportsCar/BP_VehicleAdvSportsCar"));
    if (SportsCar.Succeeded())
    {
        DefaultPawnClass = SportsCar.Class;
    }
}
