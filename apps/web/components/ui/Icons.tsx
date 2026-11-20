import React from "react";
import type { NavIconKey } from "@/content/navigation";

export function SuiDropletIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 27" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.2092 0.136174C10.3595 -0.0453913 10.6405 -0.0453913 10.7908 0.136174L18.6601 9.64487L18.6855 9.67693C20.1335 11.4527 20.9999 13.7095 21 16.166C21 21.8875 16.2995 26.5261 10.5005 26.5263C4.70135 26.5263 0 21.8877 0 16.166C9.98188e-05 13.7095 0.866524 11.4527 2.3145 9.67693L2.33992 9.64594L10.2092 0.136174ZM4.2233 11.0318C3.11287 12.3936 2.44803 14.1251 2.44797 16.0089C2.44797 20.3967 6.05275 23.9542 10.4995 23.9544C11.7672 23.9544 12.9672 23.665 14.0342 23.1498L14.0681 23.1327L14.0734 23.0964C14.1451 22.4944 14.1149 21.8056 13.9495 21.1057C13.5529 19.4286 12.1763 17.8987 9.81201 16.5688C7.09215 15.0438 5.46577 13.0748 5.01034 10.7134C4.98611 10.5878 4.9647 10.4627 4.94784 10.3383L4.92666 10.1813L4.2233 11.0318ZM10.8988 3.92833C10.6929 3.67952 10.3071 3.67952 10.1012 3.92833L8.92752 5.34731C8.56846 5.78587 8.146 6.51449 7.86189 7.3839C7.57773 8.25354 7.43002 9.26877 7.62779 10.2796C7.93408 11.8429 9.10124 13.2186 11.1393 14.3613C14.1572 16.0581 15.9904 18.1544 16.5532 20.5982C16.583 20.7275 16.6087 20.8558 16.6305 20.9829L16.657 21.1325L16.7534 21.0149C17.878 19.6487 18.552 17.9061 18.552 16.0089C18.552 14.1397 17.8971 12.4208 16.8021 11.0639L16.8032 11.0628L10.8988 3.92833Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WalrusIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 19" fill="none" className={className}>
      <path
        d="M10.3328 14.6216L11.6597 0H17.1405L18.4669 14.6216L19.2125 14.7645C19.9253 13.0984 21.8931 7.22667 22.384 0H28.8003L23.8525 18.9232H16.0883L14.7832 9.4616H14.0173L12.7123 18.9232H4.94773L0 0H6.41627C6.9072 7.22667 8.87467 13.0984 9.58773 14.7648L10.3328 14.6219V14.6216Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function NautilusIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M21.3975 23.5897H2.19162V21.3995H21.3975V23.5897ZM23.5897 21.3995H21.3996V2.19069H23.5897V21.3995ZM2.19014 21.3992H0V2.19069H2.19014V21.3992ZM14.3442 16.315V6.93849H16.3497V16.6471H12.4536L9.24739 7.27067V16.6471H7.24184V6.93849H11.1506L14.3442 16.315ZM21.398 2.1902H2.19113V0H21.398V2.1902Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DeepBookIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 14" fill="none" className={className}>
      <path d="M0 0H19.1374C22.1884 0 24.6616 2.47326 24.6616 5.52419V6.16541H0V0Z" fill="currentColor" />
      <path d="M0 13.8057H19.1374C22.1884 13.8057 24.6616 11.3324 24.6616 8.28148V7.64026H0V13.8057Z" fill="currentColor" />
    </svg>
  );
}

export function SuiNSIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 10" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.68686 2.85987C7.64404 2.85987 7.6093 2.89463 7.6093 2.93745V7.55189C7.6093 8.34162 6.9692 8.98183 6.17963 8.98183C5.39006 8.98183 4.75 8.34162 4.75 7.55189V2.93745C4.75 1.31517 6.0649 0 7.68686 0C9.30881 0 10.6237 1.31517 10.6237 2.93745V6.04439C10.6237 6.08721 10.6585 6.12195 10.7013 6.12195C10.7441 6.12195 10.7788 6.08721 10.7788 6.04439V1.42994C10.7788 0.640202 11.4189 0 12.2085 0C12.998 0 13.6381 0.640202 13.6381 1.42994V6.04439C13.6381 7.66666 12.3232 8.98183 10.7013 8.98183C9.07931 8.98183 7.76441 7.66666 7.76441 6.04439V2.93745C7.76441 2.89463 7.72967 2.85987 7.68686 2.85987Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.6946 2.90284C16.6518 2.90284 16.6171 2.9376 16.6171 2.98042C16.6171 3.02324 16.6518 3.058 16.6946 3.058H19.8009C21.4229 3.058 22.7378 4.37319 22.7378 5.99546C22.7378 7.61772 21.4229 8.9329 19.8009 8.9329H15.1874C14.3979 8.9329 13.7578 8.29272 13.7578 7.50299C13.7578 6.71323 14.3979 6.07305 15.1874 6.07305H19.8009C19.8437 6.07305 19.8785 6.03827 19.8785 5.99546C19.8785 5.95264 19.8437 5.91786 19.8009 5.91786H16.6946C15.0727 5.91786 13.7578 4.60272 13.7578 2.98042C13.7578 1.35814 15.0727 0.0429688 16.6946 0.0429688H21.3081C22.0977 0.0429688 22.7378 0.683174 22.7378 1.4729C22.7378 2.26264 22.0977 2.90284 21.3081 2.90284H16.6946Z"
        fill="currentColor"
      />
      <path
        d="M4.45784 6.72892C4.45784 5.49792 3.45992 4.5 2.22892 4.5C0.997922 4.5 0 5.49792 0 6.72892C0 7.95992 0.997922 8.95784 2.22892 8.95784C3.45992 8.95784 4.45784 7.95992 4.45784 6.72892Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HashiIcon({ className = "w-full h-auto" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" fill="none" className={className}>
      <path d="M8.96 10.24H13.44V6.4H15.52V16H13.44V12.32H8.96V16H6.88V6.4H8.96V10.24Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M22.4 22.4H0V0H22.4V22.4ZM2.08 20.32H20.32V2.08H2.08V20.32Z" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon({ className = "w-2.5 h-2.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="none" className={className}>
      <path
        d="M5.49609 10.001H4.49609V5.91895H5.49609V10.001ZM10 4.49512V5.49512H5.91797V4.49512H10ZM4.08203 5.49512H0V4.49512H4.08203V5.49512ZM5.49609 4.08301H4.49609V0.000976562L5.49609 0V4.08301Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CloseXIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.40468 6.34394L12.3745 11.3137L11.3138 12.3744L6.34402 7.4046L1.06074 12.6879L8.45562e-05 11.6272L5.28336 6.34394L8.45562e-05 1.06066L1.06074 5.29399e-07L6.34402 5.28328L11.3138 0.313503L12.3745 1.37416L7.40468 6.34394Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ExternalArrowIcon({ className = "w-2 h-2" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" fill="none" className={className}>
      <path
        d="M0.0193998 1.17602L1.1814 1.52588e-05L6.04145 0V4.89969L4.86545 6.06169V2.058L0.868 6.06017L0 5.19217L3.99745 1.176L0.0193998 1.17602Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SlideArrow({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 11" fill="none" className={`sui-slide-arrow ${className}`}>
      <path
        d="M12.7432 4.11621V6.68066L7.20996 10.7549V8.89355L10.9619 6.12891L0.000976562 6.12988L0 4.62988L10.917 4.62891L7.20996 1.87012V0L12.7432 4.11621Z"
        fill="currentColor"
      />
      <path
        d="M12.7432 4.11621V6.68066L7.20996 10.7549V8.89355L10.9619 6.12891L0.000976562 6.12988L0 4.62988L10.917 4.62891L7.20996 1.87012V0L12.7432 4.11621Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SingleArrowIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 11" fill="none" className={className}>
      <path
        d="M12.7432 4.11621V6.68066L7.20996 10.7549V8.89355L10.9619 6.12891L0.000976562 6.12988L0 4.62988L10.917 4.62891L7.20996 1.87012V0L12.7432 4.11621Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PolicyEditIcon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 43" fill="none" className={className}>
      <path
        d="M32.3505 42.6667H0V39.2002H32.3505V42.6667ZM26.7031 6.88165L2.83304 30.4916V34.5359L6.91345 34.5361L30.7872 10.9223L32.7878 12.9011L8.08552 37.3347H0.0034225L0.00368577 35.9353L0.0034225 29.9122L0.00368577 29.3328L24.7025 4.90286L26.7031 6.88165ZM37.7436 7.99748L36.5044 9.22293L35.2654 10.4486L27.1799 2.45143L29.6583 0L37.7436 7.99748Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AiSparkIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" fill="none" className={className}>
      <path d="M9.18359 11.5713L9.18366 13.4717L15.1679 14.8226L15.1678 12.9222L9.18359 11.5713Z" fill="currentColor" />
      <path d="M9.18359 18.0723L9.18366 16.1719L15.1679 14.821L15.1678 16.7214L9.18359 18.0723Z" fill="currentColor" />
      <path d="M11.0879 16.1865L9.18752 16.1866L7.83661 22.1708L9.73698 22.1708L11.0879 16.1865Z" fill="currentColor" />
      <path d="M4.58594 16.1865L6.48631 16.1866L7.83721 22.1708L5.93684 22.1708L4.58594 16.1865Z" fill="currentColor" />
      <path d="M6.4873 18.0801L6.48724 16.1797L0.503003 14.8288L0.503067 16.7292L6.4873 18.0801Z" fill="currentColor" />
      <path d="M6.4873 11.5781L6.48724 13.4785L0.503002 14.8294L0.503067 12.929L6.4873 11.5781Z" fill="currentColor" />
      <path d="M4.58301 13.4756L6.48338 13.4755L7.83428 7.49128L5.93392 7.49135L4.58301 13.4756Z" fill="currentColor" />
      <path d="M11.085 13.4756L9.18459 13.4755L7.83369 7.49128L9.73406 7.49135L11.085 13.4756Z" fill="currentColor" />
      <path d="M13.9482 6.91016L15.8486 6.91022L17.1864 10.8747L15.286 10.8747L13.9482 6.91016Z" fill="currentColor" />
      <path d="M20.4248 6.91016L18.5244 6.91022L17.1867 10.8747L19.087 10.8747L20.4248 6.91016Z" fill="currentColor" />
      <path d="M18.5332 8.80762L18.5333 6.90725L22.4978 5.56949L22.4977 7.46986L18.5332 8.80762Z" fill="currentColor" />
      <path d="M18.5332 2.33301L18.5333 4.23338L22.4978 5.57114L22.4977 3.67076L18.5332 2.33301Z" fill="currentColor" />
      <path d="M20.4297 4.23145L18.5293 4.23138L17.1916 0.266876L19.0919 0.26694L20.4297 4.23145Z" fill="currentColor" />
      <path d="M13.9541 4.23145L15.8545 4.23138L17.1922 0.266876L15.2919 0.26694L13.9541 4.23145Z" fill="currentColor" />
      <path d="M15.8447 2.33398L15.8447 4.23436L11.8802 5.57211L11.8802 3.67174L15.8447 2.33398Z" fill="currentColor" />
      <path d="M15.8447 8.80859L15.8447 6.90822L11.8802 5.57047L11.8802 7.47084L15.8447 8.80859Z" fill="currentColor" />
    </svg>
  );
}

export function TreeBranchIcon({ className = "w-6 h-2" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 8" fill="none" className={className}>
      <path d="M1 0V7H24" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function BellIcon({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 60" fill="none" className={className}>
      <path
        d="M21.8549 50.8588C21.8549 53.3347 23.9373 55.3893 26.4902 55.3893C29.0431 55.3893 31.1251 53.3347 31.1251 50.8588H35.7803C35.7803 55.9335 31.5608 60 26.4902 60C21.4196 60 17.2001 55.9335 17.2001 50.8588H21.8549ZM4.65486 44.1356H48.3448V33.7465H53V48.7459H0V33.7465H4.65486V44.1356ZM26.5006 0C38.5646 9.83889e-05 48.3443 9.68624 48.3444 21.6348L48.3448 33.7465H43.423L43.4226 21.6348C43.4225 12.3785 35.8463 4.8748 26.5006 4.8747C17.1548 4.8748 9.57821 12.3785 9.57815 21.6348L9.57852 33.7465H4.65671L4.65634 21.6348C4.65641 9.68624 14.4366 9.88151e-05 26.5006 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PlayIcon({ className = "w-2.5 h-2.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 11" fill="none" className={className}>
      <path d="M0.5 9.21582L0.5 0.866211L7.73145 5.04102L0.5 9.21582Z" stroke="currentColor" />
    </svg>
  );
}

export function DiscordIcon({ className = "w-14 h-11" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 58 45" fill="none" className={className}>
      <path
        d="M48.8186 4.19567C45.2132 2.50499 41.3469 1.25938 37.3044 0.545961C37.2308 0.532193 37.1573 0.566601 37.1194 0.635421C36.6221 1.53923 36.0713 2.71832 35.6856 3.64509C31.3377 2.97986 27.0121 2.97986 22.7533 3.64509C22.3676 2.69772 21.7968 1.53923 21.2973 0.635421C21.2594 0.568898 21.1859 0.534489 21.1122 0.545961C17.072 1.2571 13.2057 2.50271 9.59804 4.19567C9.56681 4.20943 9.54004 4.23239 9.52227 4.26219C2.18872 15.4591 0.179754 26.3807 1.16529 37.167C1.16974 37.2197 1.19873 37.2702 1.23887 37.3023C6.07733 40.9336 10.7642 43.1382 15.3641 44.5994C15.4377 44.6223 15.5157 44.5948 15.5625 44.5329C16.6506 43.0143 17.6206 41.4131 18.4522 39.7293C18.5013 39.6307 18.4544 39.5137 18.3541 39.4747C16.8156 38.8782 15.3507 38.1511 13.9415 37.3253C13.83 37.2587 13.8211 37.0958 13.9236 37.0178C14.2202 36.7907 14.5168 36.5544 14.8 36.3158C14.8512 36.2723 14.9226 36.2631 14.9828 36.2906C24.2405 40.6102 34.2631 40.6102 43.4115 36.2906C43.4718 36.2608 43.5432 36.27 43.5966 36.3136C43.8799 36.5521 44.1764 36.7907 44.4752 37.0178C44.5777 37.0958 44.571 37.2587 44.4596 37.3253C43.0504 38.1671 41.5854 38.8782 40.0447 39.4724C39.9444 39.5114 39.8998 39.6307 39.9489 39.7293C40.7983 41.4108 41.7683 43.012 42.8363 44.5306C42.8809 44.5948 42.9611 44.6223 43.0348 44.5994C47.6569 43.1382 52.3438 40.9336 57.1822 37.3023C57.2246 37.2702 57.2514 37.222 57.2558 37.1692C58.4353 24.6992 55.2803 13.8671 48.8922 4.26447C48.8765 4.23239 48.8499 4.20943 48.8186 4.19567ZM19.8347 30.5993C17.0475 30.5993 14.7509 27.9842 14.7509 24.7726C14.7509 21.561 17.0029 18.9459 19.8347 18.9459C22.6886 18.9459 24.963 21.584 24.9184 24.7726C24.9184 27.9842 22.6663 30.5993 19.8347 30.5993ZM38.6311 30.5993C35.8439 30.5993 33.5474 27.9842 33.5474 24.7726C33.5474 21.561 35.7993 18.9459 38.6311 18.9459C41.4851 18.9459 43.7594 21.584 43.7148 24.7726C43.7148 27.9842 41.4851 30.5993 38.6311 30.5993Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function XIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 15" fill="none" className={className}>
      <path
        d="M12.3227 0.624023H14.6846L9.52569 6.55986L15.6169 14.609H10.831L7.10163 9.72979L2.81291 14.609H0.451005L5.98284 8.26914L0.140228 0.624023H5.05051L8.43797 5.09921L12.3227 0.624023ZM11.4836 13.1794H12.7889L4.33572 1.96036H2.90614L11.4836 13.1794Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function YouTubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 15" fill="none" className={className}>
      <path
        d="M21.2964 2.56327C21.0557 1.65991 20.3465 0.94855 19.4459 0.707125C17.8136 0.268364 11.2682 0.268364 11.2682 0.268364C11.2682 0.268364 4.72275 0.268364 3.09041 0.707125C2.18985 0.94855 1.48056 1.65991 1.23987 2.56327C0.802486 4.20054 0.802486 7.6166 0.802486 7.6166C0.802486 7.6166 0.802486 11.0326 1.23987 12.67C1.48056 13.5733 2.18985 14.2847 3.09041 14.5262C4.72275 14.9648 11.2682 14.9648 11.2682 14.9648C11.2682 14.9648 17.8136 14.9648 19.4459 14.5262C20.3465 14.2847 21.0557 13.5733 21.2964 12.67C21.7338 11.0326 21.7338 7.6166 21.7338 7.6166C21.7338 7.6166 21.7338 4.20054 21.2964 2.56327Z"
        fill="currentColor"
      />
      <path d="M9.1276 10.7188L14.5983 7.61738L9.1276 4.51571V10.7188Z" fill="#000000" />
    </svg>
  );
}

export function LinkedInIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="none" className={className}>
      <path
        d="M14.0573 14.2765H11.6518V10.5465C11.6518 9.65708 11.6358 8.51208 10.4007 8.51208C9.14783 8.51208 8.95614 9.48117 8.95614 10.4818V14.2763H6.55063V6.60589H8.85991V7.65413H8.89224C9.12335 7.26288 9.4573 6.94102 9.85853 6.72283C10.2598 6.50464 10.7133 6.39829 11.1707 6.4151C13.6088 6.4151 14.0583 8.00297 14.0583 10.0687L14.0573 14.2765ZM3.83644 5.5574C3.56035 5.55745 3.29044 5.47644 3.06085 5.3246C2.83126 5.17276 2.65232 4.95693 2.54662 4.70438C2.44092 4.45184 2.41321 4.17393 2.46703 3.9058C2.52084 3.63768 2.65375 3.39137 2.84894 3.19803C3.04413 3.0047 3.29284 2.87301 3.56362 2.81963C3.83439 2.76625 4.11507 2.79357 4.37016 2.89814C4.62526 3.00271 4.8433 3.17983 4.99673 3.4071C5.15016 3.63438 5.23208 3.90159 5.23213 4.17497C5.23217 4.35648 5.19609 4.53622 5.12596 4.70393C5.05584 4.87163 4.95306 5.02402 4.82345 5.15239C4.69385 5.28076 4.53997 5.3826 4.37062 5.45209C4.20127 5.52159 4.01976 5.55737 3.83644 5.5574ZM5.03919 14.2765H2.63119V6.60589H5.03919V14.2765ZM15.2565 0.581173H1.42244C1.10844 0.577665 0.805871 0.697732 0.581236 0.914989C0.356602 1.13225 0.228281 1.42892 0.224449 1.73982V15.4945C0.22815 15.8055 0.356396 16.1024 0.581022 16.3199C0.805649 16.5374 1.10829 16.6577 1.42244 16.6544H15.2565C15.5713 16.6583 15.8748 16.5383 16.1003 16.3208C16.3258 16.1034 16.4549 15.8061 16.4593 15.4945V1.73883C16.4548 1.42731 16.3256 1.1303 16.1001 0.913048C15.8745 0.695796 15.5711 0.576072 15.2565 0.58018"
        fill="currentColor"
      />
    </svg>
  );
}

export function ProtocolIcon({
  name,
  className = "w-full h-full",
}: {
  name: "sui" | "walrus" | "seal" | "nautilus" | "deepbook" | "suins" | "hashi";
  className?: string;
}) {
  switch (name) {
    case "sui":
      return <SuiDropletIcon className={className} />;
    case "walrus":
      return <WalrusIcon className={className} />;
    case "nautilus":
      return <NautilusIcon className={className} />;
    case "deepbook":
      return <DeepBookIcon className={className} />;
    case "suins":
      return <SuiNSIcon className={className} />;
    case "hashi":
      return <HashiIcon className={className} />;
    case "seal":
      return <img src="/assets/logos/seal-logo.svg" alt="Seal" className={className} />;
  }
}

export function NavMenuIcon({ icon, className = "w-4 h-4" }: { icon: NavIconKey; className?: string }) {
  switch (icon) {
    case "sui-stack":
    case "building":
    case "ideas":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 22" fill="none" className={className}>
          <path
            d="M9.37586 19.2781L18.7522 13.3348H18.7573V15.3867L9.3756 21.3333L0 15.3871V13.3348H0.00497212L9.37586 19.2781ZM13.4148 2.56159V4.61667L9.37586 2.05664L0.00497212 8L9.37586 13.9434L18.7522 8H18.7573V10.052L9.3756 15.9986L0 10.0523V5.94766L9.3756 0.00143229L13.4148 2.56159Z"
            fill="currentColor"
          />
        </svg>
      );
    case "deepbook":
      return <DeepBookIcon className={className} />;
    case "hashi":
      return <HashiIcon className={className} />;
    case "nautilus":
      return <NautilusIcon className={className} />;
    case "walrus":
      return <WalrusIcon className={className} />;
    case "suins":
      return <SuiNSIcon className={className} />;
    case "seal":
      return <img src="/assets/logos/seal-logo.svg" alt="Seal" className={className} />;
    case "ai":
    case "ai-assistant":
      return <AiSparkIcon className={className} />;
    case "coding":
    case "move":
    case "starter":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" fill="none" className={className}>
          <path
            d="M4.97971 1.87972L1.02525 6.00132L4.97971 10.1228V12L0 6.81V5.19254L4.97971 0.00253871V1.87972ZM16 5.19254V6.81L11.0204 12V10.1228L14.9749 6.00132L11.0204 1.87972V0.00253871L16 5.19254ZM7.09395 11.9983H5.7485L8.96287 0H10.3082L7.09395 11.9983Z"
            fill="currentColor"
          />
        </svg>
      );
    case "earning":
    case "funding":
    case "buybacks":
    case "deflation":
    case "circulation":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19 15" fill="none" className={className}>
          <path
            d="M18.1538 6.99552V8.66742L16.1324 7.07564V7.07692C16.1324 10.9854 12.9736 14.1538 9.07687 14.1538C6.38651 14.1538 4.04889 12.6433 2.85927 10.4247L4.01398 9.80181C4.98417 11.6112 6.88809 12.8388 9.07687 12.8388C12.2495 12.8388 14.8213 10.2591 14.8213 7.07692V7.07475L12.8001 8.66732V6.99503L15.4759 4.88688L18.1538 6.99552ZM9.07687 0C11.7734 0 14.1156 1.51753 15.3026 3.74449L14.1465 4.36458C13.1784 2.5484 11.2707 1.31507 9.07687 1.31507C5.90526 1.31508 3.33397 3.8932 3.33242 7.07406L5.35374 5.48149V7.15378L2.67795 9.26193L0 7.15329V5.48139L2.02132 7.07297C2.02345 3.16631 5.18151 0 9.07687 0Z"
            fill="currentColor"
          />
        </svg>
      );
    case "connecting":
    case "community":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" className={className}>
          <path
            d="M8 0C12.1943 0 15.6367 3.20974 15.9921 7.30039H14.682V8.60034H11.3762C11.3223 10.4525 11.0205 12.1409 10.5438 13.4231C10.4197 13.7568 10.2806 14.0704 10.1269 14.3564C12.612 13.5299 14.4511 11.2949 14.6913 8.60112H16C15.6918 12.7386 12.2279 16 8 16C3.77212 16 0.308231 12.7386 0 8.60112H1.30869C1.54891 11.2949 3.38799 13.5299 5.87313 14.3564C5.71938 14.0704 5.5803 13.7568 5.45621 13.4231C4.9795 12.1409 4.67784 10.4525 4.62392 8.60034H1.31829V7.30039H0.0079368C0.363333 3.20974 3.80572 0 8 0Z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return <SuiDropletIcon className={className} />;
  }
}
