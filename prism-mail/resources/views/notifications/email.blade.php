@if (! \PrismMail\Support\Render::enabled())
{!! view()->file(resource_path('views/vendor/notifications/email.blade.php'), \Illuminate\Support\Arr::except($__data, ['__env', 'app']))->render() !!}
@else
@php
    $prism = \PrismMail\Support\Render::prepare($greeting ?? null, $introLines ?? [], $actionText ?? null, $outroLines ?? [], $level ?? 'info');
    $font = "font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";
    $paragraph = 'margin: 0 0 16px; color: #51545e; font-size: 16px; line-height: 1.6;';
    $small = 'margin: 0 0 8px; color: #8a8d96; font-size: 12px; line-height: 1.5;';
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <style type="text/css">
        @media only screen and (max-width: 600px) {
            .prism-card { padding: 24px !important; }
            .prism-button { display: block !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #f2f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f2f4f6;">
    <tr>
        <td align="center" style="padding: 32px 12px;">
            <table width="570" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 570px;">
                <tr>
                    <td align="center" style="{{ $font }} padding: 0 0 24px;">
                        <a href="{{ url('/') }}" target="_blank" style="text-decoration: none; color: #2f3133; font-size: 18px; font-weight: bold;">
                            @if ($prism['logo'])
                                <img src="{{ $prism['logo'] }}" alt="{{ $prism['panel'] }}" style="display: block; margin: 0 auto 8px; max-height: 56px; max-width: 240px; border: 0;">
                            @endif
                            {{ $prism['header'] }}
                        </a>
                    </td>
                </tr>
                <tr>
                    <td class="prism-card" style="{{ $font }} padding: 36px; background-color: #ffffff; border-radius: 12px; border-top: 4px solid {{ $prism['color'] }};">
                        <h1 style="margin: 0 0 20px; color: #2f3133; font-size: 20px; font-weight: bold;">{{ $prism['greeting'] }}</h1>

                        @foreach ($prism['introLines'] as $line)
                            <p style="{{ $paragraph }}">{{ $line }}</p>
                        @endforeach

                        @if (isset($prism['actionText'], $actionUrl))
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $actionUrl }}" class="prism-button" target="_blank" style="{{ $font }} display: inline-block; padding: 12px 28px; background-color: {{ $prism['button'] }}; border-radius: 8px; color: #ffffff; font-size: 15px; font-weight: bold; text-decoration: none;">{{ $prism['actionText'] }}</a>
                                    </td>
                                </tr>
                            </table>
                        @endif

                        @foreach ($prism['outroLines'] as $line)
                            <p style="{{ $paragraph }}">{{ $line }}</p>
                        @endforeach

                        @if ($prism['signOff'] !== '')
                            <p style="{{ $paragraph }} margin-bottom: 0;">{{ $prism['signOff'] }}<br>{{ $prism['panel'] }}</p>
                        @endif

                        @if (isset($prism['actionText'], $actionUrl))
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 28px; border-top: 1px solid #eaeaec;">
                                <tr>
                                    <td style="{{ $font }} padding-top: 20px;">
                                        <p style="{{ $small }}">If the "{{ $prism['actionText'] }}" button does not work, copy this address into your browser:</p>
                                        <p style="{{ $small }} word-break: break-all;"><a href="{{ $actionUrl }}" target="_blank" style="color: {{ $prism['color'] }};">{{ $actionUrl }}</a></p>
                                    </td>
                                </tr>
                            </table>
                        @endif
                    </td>
                </tr>
                <tr>
                    <td align="center" style="{{ $font }} padding: 24px 12px 0;">
                        @foreach (preg_split('/\R/', $prism['footer']) as $line)
                            <p style="{{ $small }}">{{ $line }}</p>
                        @endforeach
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
@endif
