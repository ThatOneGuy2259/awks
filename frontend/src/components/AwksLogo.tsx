import { useId } from 'react';

interface AwksLogoProps {
  className?: string;
}

export function AwksLogo({ className }: AwksLogoProps) {
  const id = useId();
  const maskId = `awks-mask${id}`;
  const gradId = `awks-grad${id}`;

  return (
    <svg
      viewBox="0 0 670 204"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="AWKS"
    >
      <mask id={maskId} style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="670" height="204">
        <path d="M7 96.1001V107.1" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M114.6 91.2001V107.7" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M28.4999 82.1001V120.1" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M93 70.6001V132.1" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M50 57.1001V143.6" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M71.2999 7V197" stroke="#FF0000" strokeWidth="14" strokeLinecap="round"/>
        <path d="M159.778 57.2465C163.011 51.1468 170.577 48.8221 176.677 52.0551C182.776 55.2881 185.1 62.8539 181.867 68.9536L134.617 158.1H106.322L109.955 151.247L159.778 57.2465Z" fill="#FF0000"/>
        <path d="M199.547 57.2493C196.314 51.1495 188.748 48.8248 182.648 52.0579C176.549 55.2909 174.225 62.8567 177.458 68.9563L224.708 158.103H253.003L249.37 151.249L199.547 57.2493Z" fill="#FF0000"/>
        <path d="M219.787 139.598C226.689 139.716 232.38 134.216 232.498 127.313C232.616 120.411 227.115 114.72 220.213 114.602L170.66 113.757L157.003 138.528L164.749 138.66L219.787 139.598Z" fill="#FF0000"/>
        <ellipse cx="179.7" cy="59.3001" rx="19.5" ry="11.5" fill="#FF0000"/>
        <rect x="421.2" y="49.1001" width="24" height="109" fill="#FF0000"/>
        <path d="M458.14 118.966L443.223 101.46L503.732 49.8999H539.194L458.14 118.966Z" fill="#FF0000"/>
        <path d="M458.417 89.4001L443.5 106.906L504.01 158.466H539.472L458.417 89.4001Z" fill="#FF0000"/>
        <path d="M445.39 104.394H445.808" stroke="#FF0000" strokeWidth="2" strokeLinecap="round"/>
        <path d="M654.574 72.1001H581V50.1001H666.597L654.574 72.1001Z" fill="#FF0000"/>
        <path d="M556.798 136.1H629V158.1H545L556.798 136.1Z" fill="#FF0000"/>
        <rect x="581.5" y="93.6001" width="51" height="21" fill="#FF0000" stroke="#FF0000"/>
        <path d="M583.4 61.1001C547.953 61.1001 542.591 104.3 586.9 104.3" stroke="#FF0000" strokeWidth="22"/>
        <path d="M630.6 104.1C666.047 104.1 671.808 147.1 627.5 147.1" stroke="#FF0000" strokeWidth="22"/>
        <path d="M260.029 50.4458L302.294 149.417L306.002 158.1H278.745L234.74 55.0522L232.632 50.1157L260.029 50.4458Z" fill="#FF0000"/>
        <path d="M331.397 50.4302L373.662 149.402L377.37 158.084H350.113L306.108 55.0366L304 50.1001L331.397 50.4302Z" fill="#FF0000"/>
        <path d="M343.287 87.8589L314.248 158.1H287.193L318.07 83.4116L345.266 83.0737L343.287 87.8589Z" fill="#FF0000"/>
        <rect x="380" y="50.1001" width="25" height="73" fill="#FF0000"/>
        <path d="M381.328 91.2807C395.198 93.6835 405 104.811 405 121.576C405 140.595 394.859 158.1 378 158.1C361.141 158.1 345 144.248 345 125.228C345 121.616 345.493 118.134 346.407 114.863C348.498 126.033 358.282 134.497 367.053 134.497C376.936 134.496 381.789 123.751 381.789 110.495C381.789 104.656 381.97 97.4812 381.328 91.2807Z" fill="#FF0000"/>
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect x="-11.901" y="-132" width="683" height="524" fill={`url(#${gradId})`}/>
      </g>
      <defs>
        <linearGradient id={gradId} x1="-11.901" y1="142" x2="663.961" y2="138.335" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: 'var(--color-secondary)' }}/>
          <stop offset="1" style={{ stopColor: 'var(--color-primary)' }}/>
        </linearGradient>
      </defs>
    </svg>
  );
}
