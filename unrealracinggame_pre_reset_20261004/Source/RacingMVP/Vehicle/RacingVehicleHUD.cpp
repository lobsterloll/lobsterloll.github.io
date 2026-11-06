#include "Vehicle/RacingVehicleHUD.h"
#include "Vehicle/RacingPlayerVehicle.h"
#include "Vehicle/VehiclePresentationComponent.h"
#include "Core/RacingGameMode.h"
#include "Race/RaceManager.h"
#include "Road/RoadLaneSpline.h"
#include "Road/RoadNetworkSubsystem.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "GameFramework/PlayerController.h"
#include "Components/SplineComponent.h"
#include "Engine/World.h"

void ARacingVehicleHUD::DrawHUD()
{
    Super::DrawHUD();
    const APlayerController* PC = GetOwningPlayerController();
    const ARacingPlayerVehicle* Car = PC ? Cast<ARacingPlayerVehicle>(PC->GetPawn()) : nullptr;
    const UVehiclePresentationComponent* Presentation = Car ? Car->GetPresentation() : nullptr;
    if (!Presentation || !Canvas || !GEngine) return;
    const FRacingVehicleState& State = Presentation->State;
    const FString Gear = State.Gear < 0 ? TEXT("R") : (State.Gear == 0 ? TEXT("N") : FString::Printf(TEXT("D%d"), State.Gear));
    const float X = 35.0f;
    const float Y = Canvas->SizeY - 125.0f;
    Canvas->K2_DrawTexture(Canvas->DefaultTexture, FVector2D(20.0f, Y - 12.0f), FVector2D(600.0f, 112.0f),
        FVector2D::ZeroVector, FVector2D::UnitVector, FLinearColor(0.02f, 0.035f, 0.045f, 0.82f), BLEND_Translucent);
    Canvas->SetDrawColor(FColor::White);
    Canvas->DrawText(GEngine->GetLargeFont(), FString::Printf(TEXT("%03.0f km/h   %s"), FMath::Abs(State.SpeedKmh), *Gear), X, Y);
    Canvas->DrawText(GEngine->GetSmallFont(), FString::Printf(TEXT("%04.0f RPM    SLIP %.1f    SURFACE %d"),
        State.EngineRPM, State.WheelSlip, static_cast<int32>(State.Surface.GetValue())), X, Y + 45.0f);
    Canvas->DrawText(GEngine->GetSmallFont(), TEXT("W/S drive   A/D steer   Space handbrake   C camera   H lights   Z/X indicators   R reset"), X, Canvas->SizeY - 28.0f);

    constexpr float MapSize = 208.0f;
    const FVector2D MapOrigin(Canvas->SizeX - MapSize - 22.0f, 22.0f);
    Canvas->K2_DrawTexture(Canvas->DefaultTexture, MapOrigin, FVector2D(MapSize, MapSize),
        FVector2D::ZeroVector, FVector2D::UnitVector, FLinearColor(0.015f, 0.025f, 0.03f, 0.88f), BLEND_Translucent);
    Canvas->SetDrawColor(FColor(100, 114, 119, 210));
    auto ToMap = [&MapOrigin](const FVector& WorldPoint)
    {
        constexpr float WorldHalfX = 60000.0f;
        constexpr float WorldHalfY = 55000.0f;
        constexpr float Size = 208.0f;
        return FVector2D(MapOrigin.X + (WorldPoint.X + WorldHalfX) / (WorldHalfX * 2.0f) * Size,
            MapOrigin.Y + (WorldHalfY - WorldPoint.Y) / (WorldHalfY * 2.0f) * Size);
    };
    const URoadNetworkSubsystem* RoadNetwork = GetWorld() ? GetWorld()->GetSubsystem<URoadNetworkSubsystem>() : nullptr;
    if (RoadNetwork)
    {
        for (const TObjectPtr<ARoadLaneSpline>& Lane : RoadNetwork->GetLanes())
        {
            if (!Lane || !Lane->LaneSpline) continue;
            const int32 PointCount = Lane->LaneSpline->GetNumberOfSplinePoints();
            for (int32 PointIndex = 1; PointIndex < PointCount; ++PointIndex)
            {
                Canvas->K2_DrawLine(ToMap(Lane->LaneSpline->GetLocationAtSplinePoint(PointIndex - 1, ESplineCoordinateSpace::World)),
                    ToMap(Lane->LaneSpline->GetLocationAtSplinePoint(PointIndex, ESplineCoordinateSpace::World)), 1.5f,
                    FLinearColor(0.55f, 0.62f, 0.61f, 0.92f));
            }
        }
    }
    const FVector2D CarMapPosition = ToMap(Car->GetActorLocation());
    const FVector CarForward = Car->GetActorForwardVector();
    const FVector2D CarHeading(CarForward.X, -CarForward.Y);
    const FVector2D HeadingEnd = CarMapPosition + CarHeading * 8.0f;
    Canvas->SetDrawColor(FColor(80, 180, 255, 255));
    Canvas->K2_DrawLine(CarMapPosition, HeadingEnd, 2.5f, FLinearColor(0.18f, 0.68f, 1.0f, 1.0f));
    Canvas->K2_DrawLine(CarMapPosition + FVector2D(-3.0f, 0.0f), CarMapPosition + FVector2D(3.0f, 0.0f), 2.5f,
        FLinearColor(0.18f, 0.68f, 1.0f, 1.0f));
    Canvas->K2_DrawLine(CarMapPosition + FVector2D(0.0f, -3.0f), CarMapPosition + FVector2D(0.0f, 3.0f), 2.5f,
        FLinearColor(0.18f, 0.68f, 1.0f, 1.0f));
    Canvas->SetDrawColor(FColor::White);
    Canvas->DrawText(GEngine->GetSmallFont(), TEXT("CITY MAP"), MapOrigin.X + 7.0f, MapOrigin.Y + 5.0f);

    const ARacingGameMode* Mode = GetWorld() ? GetWorld()->GetAuthGameMode<ARacingGameMode>() : nullptr;
    const ARaceManager* Race = Mode ? Mode->GetRaceManager() : nullptr;
    if (!Race) return;
    const ERacePhase Phase = Race->GetPhase();
    if (Phase == ERacePhase::FreeDrive) return;
    const float PanelX = 24.0f;
    const float PanelY = 22.0f;
    const float PanelWidth = Phase == ERacePhase::Results ? 400.0f : 340.0f;
    const float PanelHeight = Phase == ERacePhase::Results ? 200.0f : 110.0f;
    Canvas->K2_DrawTexture(Canvas->DefaultTexture, FVector2D(PanelX, PanelY), FVector2D(PanelWidth, PanelHeight),
        FVector2D::ZeroVector, FVector2D::UnitVector, FLinearColor(0.015f, 0.025f, 0.035f, 0.87f), BLEND_Translucent);
    Canvas->SetDrawColor(FColor::White);
    if (Phase == ERacePhase::Offer)
    {
        Canvas->DrawText(GEngine->GetLargeFont(), TEXT("SPRINT RACE"), PanelX + 12.0f, PanelY + 9.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), TEXT("Press E to race 3 opponents"), PanelX + 12.0f, PanelY + 56.0f);
    }
    else if (Phase == ERacePhase::Countdown)
    {
        Canvas->DrawText(GEngine->GetLargeFont(), FString::Printf(TEXT("START IN %d"), FMath::Max(1, FMath::CeilToInt(Race->GetCountdownRemaining()))),
            PanelX + 12.0f, PanelY + 9.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), TEXT("Esc pause   T restart   M leave"), PanelX + 12.0f, PanelY + 56.0f);
    }
    else if (Phase == ERacePhase::Racing)
    {
        Canvas->DrawText(GEngine->GetLargeFont(), Race->GetGoFlashRemaining() > 0.0f ? TEXT("GO!") :
            FString::Printf(TEXT("SPRINT  %d/4"), Race->GetPlayerRank()), PanelX + 12.0f, PanelY + 9.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), FString::Printf(TEXT("%.1f s   CP %d/3"), Race->GetRaceElapsed(), Race->GetPlayerCheckpointCount()),
            PanelX + 12.0f, PanelY + 56.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), TEXT("Esc pause   T restart   M leave"), PanelX + 12.0f, PanelY + 80.0f);
    }
    else if (Phase == ERacePhase::Results)
    {
        Canvas->DrawText(GEngine->GetLargeFont(), TEXT("RACE RESULTS"), PanelX + 12.0f, PanelY + 8.0f);
        const TArray<FString> Lines = Race->GetResultLines();
        for (int32 Index = 0; Index < Lines.Num(); ++Index)
            Canvas->DrawText(GEngine->GetSmallFont(), Lines[Index], PanelX + 12.0f, PanelY + 51.0f + Index * 25.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), TEXT("E free drive   T retry   M leave"), PanelX + 12.0f, PanelY + 160.0f);
    }
    if (Race->IsRacePaused())
    {
        Canvas->K2_DrawTexture(Canvas->DefaultTexture,
            FVector2D(Canvas->SizeX * 0.5f - 160.0f, Canvas->SizeY * 0.5f - 50.0f), FVector2D(320.0f, 100.0f),
            FVector2D::ZeroVector, FVector2D::UnitVector, FLinearColor(0.02f, 0.025f, 0.035f, 0.91f), BLEND_Translucent);
        Canvas->DrawText(GEngine->GetLargeFont(), TEXT("PAUSED"), Canvas->SizeX * 0.5f - 95.0f, Canvas->SizeY * 0.5f - 32.0f);
        Canvas->DrawText(GEngine->GetSmallFont(), TEXT("Esc resume   T restart   M leave"), Canvas->SizeX * 0.5f - 135.0f, Canvas->SizeY * 0.5f + 17.0f);
    }
}
