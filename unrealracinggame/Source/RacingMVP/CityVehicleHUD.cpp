#include "CityVehicleHUD.h"
#include "CityInstancedGeometry.h"
#include "EngineUtils.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "WheeledVehiclePawn.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

void ACityVehicleHUD::DrawHUD()
{
    Super::DrawHUD();

    const AWheeledVehiclePawn* Vehicle = Cast<AWheeledVehiclePawn>(GetOwningPawn());
    if (!Vehicle)
    {
        return;
    }

    const UChaosWheeledVehicleMovementComponent* Movement =
        Cast<UChaosWheeledVehicleMovementComponent>(Vehicle->GetVehicleMovementComponent());
    if (!Movement)
    {
        return;
    }

    const int32 SpeedKmh = FMath::RoundToInt(FMath::Abs(Movement->GetForwardSpeed()) * 0.036f);
    const int32 Gear = Movement->GetCurrentGear();
    const FString GearText = Gear < 0 ? TEXT("R") : Gear == 0 ? TEXT("N") : FString::FromInt(Gear);
    const int32 Rpm = FMath::RoundToInt(Movement->GetEngineRotationSpeed());
    FString Surface = TEXT("Unknown");
    float Slip = 0.0f;
    for (int32 Index = 0; Index < Movement->GetNumWheels(); ++Index)
    {
        const FWheelStatus& Wheel = Movement->GetWheelState(Index);
        if (Wheel.bInContact)
        {
            if (const UPhysicalMaterial* Physical = Wheel.PhysMaterial.Get())
            {
                if (Physical->GetFName() == FName(TEXT("PM_CityGrass")))
                {
                    Surface = TEXT("Grass");
                }
                else if (Physical->GetFName() == FName(TEXT("PM_CityAsphalt")))
                {
                    Surface = TEXT("Asphalt");
                }
            }
            Slip = FMath::Max(Slip, Wheel.SkidMagnitude + Wheel.SlipMagnitude);
        }
    }
    const float Top = Canvas->SizeY - 130.0f;

    DrawRect(FLinearColor(0.01f, 0.02f, 0.03f, 0.7f), 18, Top, 650, 112);
    DrawText(FString::Printf(TEXT("%03d km/h    %s    %d RPM"), SpeedKmh, *GearText, Rpm),
        FLinearColor::White, 32, Top + 9, GEngine->GetMediumFont(), 1.4f);
    DrawText(FString::Printf(TEXT("Surface: %s    Tire slip: %.1f"), *Surface, Slip),
        FLinearColor(0.7f, 0.8f, 0.85f), 32, Top + 49, GEngine->GetSmallFont(), 1.0f);
    DrawText(TEXT("W/S Drive  A/D Steer  Space Handbrake  C Camera  H Lights  R Reset"),
        FLinearColor(0.7f, 0.8f, 0.85f), 32, Top + 76, GEngine->GetSmallFont(), 1.0f);

    if (!RoadCity.IsValid())
    {
        for (TActorIterator<ACityInstancedGeometry> It(GetWorld()); It; ++It)
        {
            RoadCity = *It;
            break;
        }
    }
    if (!RoadCity.IsValid())
    {
        return;
    }

    const float MapSize = 205.0f;
    const float MapX = Canvas->SizeX - MapSize - 18.0f;
    const float MapY = 18.0f;
    const FVector2D Min = RoadCity->GetMapMin();
    const FVector2D Max = RoadCity->GetMapMax();
    const FVector2D Range = Max - Min;
    if (Range.X <= 0 || Range.Y <= 0)
    {
        return;
    }
    auto ToMap = [&](const FVector& Point)
    {
        return FVector2D(MapX + (Point.X - Min.X) / Range.X * MapSize,
            MapY + (Max.Y - Point.Y) / Range.Y * MapSize);
    };

    DrawRect(FLinearColor(0.01f, 0.03f, 0.05f, 0.82f), MapX - 5, MapY - 5,
        MapSize + 10, MapSize + 28);
    const TArray<FVector>& Edges = RoadCity->GetRoadEdges();
    for (int32 Index = 0; Index + 1 < Edges.Num(); Index += 2)
    {
        const FVector2D A = ToMap(Edges[Index]);
        const FVector2D B = ToMap(Edges[Index + 1]);
        DrawLine(A.X, A.Y, B.X, B.Y, FLinearColor(0.58f, 0.67f, 0.68f), 2.0f);
    }
    const FVector2D Player = ToMap(Vehicle->GetActorLocation());
    const float Heading = FMath::DegreesToRadians(Vehicle->GetActorRotation().Yaw);
    DrawRect(FLinearColor(0.02f, 0.82f, 1.0f), Player.X - 4, Player.Y - 4, 8, 8);
    DrawLine(Player.X, Player.Y, Player.X + FMath::Cos(Heading) * 12.0f,
        Player.Y - FMath::Sin(Heading) * 12.0f, FLinearColor(0.02f, 0.82f, 1.0f), 2.0f);
    DrawText(TEXT("CITY MAP"), FLinearColor::White, MapX + 4, MapY + MapSize + 4,
        GEngine->GetSmallFont(), 0.8f);
}
